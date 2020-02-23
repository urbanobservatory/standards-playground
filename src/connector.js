/**
 * This API doesn't go anywhere near a database or a real data source. Instead, if reads off a bunch of information
 * from an older API at Newcastle stores it all in memory, and subscribes to a Websocket to update the real values.
 *
 * This clearly isn't a sensible way to implement an API, but it means you can run this code without going anywhere
 * near our databases and server internals, and that helps me sleep at night.
 *
 * This file is entirely focused on the interaction between the 'real' API and this playground API.
 */

const fetch = require('isomorphic-fetch');
const WebSocket = require('ws');

const building = require('./formatters');

// Test data here is used until the real data has been fetched from the API
// Means I don't have to wait ages while coding...
let buildingRooms = {
  '2.048': {
    zones: {
      '1': {
        'air-temperature': {
          sensor: 'device/bms-hvac/siemens-qmx3.p70/room-2.048/zone-1/air-temperature'
        }
      }
    }
  }
};
let buildingSensors = {
  'device/bms-hvac/siemens-qmx3.p70/room-2.048/zone-1/air-temperature': {
    property: 'AirTemperature',
    result: {
      type: 'DegreesCelsius',
      time: '2020-01-01T00:00:00Z',
      value: 21.0
    }
  }
};
let websocketIds = {};
let ws = null;
let buildingRoomIds = null;

async function loadFromApi() {
  let pageId = 0;
  let pageCount = null;

  const newBuildingRooms = {};
  const newBuildingSensors = {};
  const newWebsocketIds = {};

  const metricToProperties = {
    'Room Temperature': {
      property: 'AirTemperature',
      slug: 'air-temperature',
      unit: 'DegreesCelsius'
    },
    'CO2': {
      property: 'CO2Concentration',
      slug: 'co2-concentration',
      unit: 'PartsPerMillion'
    },
    'Relative Humidity': {
      property: 'RelativeHumidity',
      slug: 'relative-humidity',
      unit: 'Percent'
    }
  };

  if (ws) {
    ws.terminate();
    ws = null;
  }

  console.info(`Connecting to WebSocket stream from Newcastle UO API...`);

  ws = new WebSocket('wss://api.usb.urbanobservatory.ac.uk/stream');
  ws.addEventListener('open', () => {
    console.info('Connection opened to WebSocket.');
  });
  ws.addEventListener('message', message => {
    try {
      const payload = JSON.parse(message.data).data;
      const broker = payload.brokerage.broker.id;
      const source = payload.brokerage.id;

      if (websocketIds[broker] && websocketIds[broker][source]) {
        const devicePath = websocketIds[broker][source];
        const sensor = buildingSensors[devicePath];

        sensor.result.value = payload.timeseries.value.data;
        sensor.result.time = payload.timeseries.value.time;

        console.info(`Updated ${devicePath} observation to ${sensor.result.value}.`);
      }
    } catch (e) {}
  });

  console.info(`Loading room identities from Newcastle UO API...`);
  while (pageCount === null || pageId <= pageCount) {
    const sourceRes = await fetch(`https://api.usb.urbanobservatory.ac.uk/api/v2/sensors/entity?page=${pageId}`);
    const sourceJson = await sourceRes.json();

    let addedTotal = 0;
    let zone = null;

    sourceJson.items.forEach(
      entity => {
        if (!entity.meta.roomNumber) return;
        let devicePrefix = `device/bms-hvac/siemens-qmx3.p70/room-${entity.meta.roomNumber}`;

        if (!newBuildingRooms[entity.meta.roomNumber]) {
          newBuildingRooms[entity.meta.roomNumber] = {};
        }
        zone = newBuildingRooms[entity.meta.roomNumber];

        if (entity.meta.roomZone) {
          devicePrefix += `/zone-${entity.meta.roomZone}`;

          if (!newBuildingRooms[entity.meta.roomNumber].zones) {
            newBuildingRooms[entity.meta.roomNumber].zones = {};
          }

          if (!newBuildingRooms[entity.meta.roomNumber].zones[entity.meta.roomZone]) {
            newBuildingRooms[entity.meta.roomNumber].zones[entity.meta.roomZone] = {};
          }

          zone = newBuildingRooms[entity.meta.roomNumber].zones[entity.meta.roomZone];
        }

        addedTotal++;

        entity.feed.forEach(
          feed => {
            if (metricToProperties[feed.metric]) {
              const devicePath = `${devicePrefix}/${metricToProperties[feed.metric].slug}`;

              feed.timeseries.forEach(
                timeseries => {
                  zone[metricToProperties[feed.metric].slug] = {
                    sensor: devicePath
                  };
                  newBuildingSensors[devicePath] = {
                    property: metricToProperties[feed.metric].property,
                    result: timeseries.latest ? {
                      type: metricToProperties[feed.metric].unit,
                      value: timeseries.latest.value,
                      time: timeseries.latest.time
                    } : {}
                  };

                  feed.brokerage.forEach(
                    brokerage => {
                      if (!newWebsocketIds[brokerage.broker.name]) {
                        newWebsocketIds[brokerage.broker.name] = {};
                      }

                      newWebsocketIds[brokerage.broker.name][brokerage.sourceId] = devicePath;
                    }
                  );
                }
              );
            }
          }
        );
      }
    );

    console.info(`Received ${sourceJson.items.length} items from USB API and loaded ${addedTotal} rooms.`);

    pageCount = sourceJson.pagination.pageCount;
    pageId++;
  }

  buildingRooms = newBuildingRooms;
  buildingSensors = newBuildingSensors;
  websocketIds = newWebsocketIds;
}

function getFilteredRooms(pagination, filters) {
  if (!buildingRoomIds || Object.keys(buildingRooms).length !== buildingRoomIds.length) {
    buildingRoomIds = Object.keys(buildingRooms).sort();
  }

  const roomSet = {};
  const roomPage = buildingRoomIds.slice(pagination.offset, pagination.offset + pagination.limit);

  roomPage.forEach(
    roomId => {
      roomSet[`room/${roomId}`] = getRoom(roomId)
    }
  );

  return roomSet;
}

function getRoom(roomNumber) {
  if (!buildingRooms[roomNumber]) {
    return null;
  }

  if (buildingRooms[roomNumber].zones) {
    const zones = {};

    Object
      .keys(buildingRooms[roomNumber].zones)
      .forEach(zoneId => {
        zones[`/api/room/${roomNumber}/zone-${zoneId}`] = getZone(roomNumber, zoneId);
      });

    return building.room({
      roomNumber,
      zones
    });
  }

  return building.room({
    roomNumber,
    isFeatureOfInterestOf: getObservationsForRoom(roomNumber)
  });
}

function getZone(roomNumber, zoneNumber) {
  if (!buildingRooms[roomNumber] ||
    !buildingRooms[roomNumber].zones ||
    !buildingRooms[roomNumber].zones[zoneNumber]) {
    return null;
  }

  return building.zone({
    roomNumber,
    zoneNumber,
    isFeatureOfInterestOf: getObservationsForRoom(roomNumber, zoneNumber)
  });
}

function getObservation(roomNumber, zoneNumber = '', property) {
  const room = buildingRooms[roomNumber] || {};
  const zone = room.zones ? room.zones[zoneNumber] : room;
  if (!zone) return null;

  const slug = `observation/room-${roomNumber}${zoneNumber ? `-zone-${zoneNumber}` : ''}-${property}`;
  const sensor = {
    sensor: zone[property].sensor,
    ...buildingSensors[zone[property].sensor]
  };
  return building.observation(sensor);
}

function getObservationsForRoom(roomNumber, zoneNumber = '') {
  const observations = {};
  const room = buildingRooms[roomNumber] || {};
  const zone = room.zones ? room.zones[zoneNumber] : room;

  if (!zone) return observations;

  Object.keys(zone).forEach(observation => {
    const slug = `observation/room-${roomNumber}${zoneNumber ? `-zone-${zoneNumber}` : ''}-${observation}`;
    const sensor = {
      sensor: zone[observation].sensor,
      ...buildingSensors[zone[observation].sensor]
    };
    observations[slug] = building.observation(sensor);
  });

  return observations;
}

function getSensor(group, platformType, roomNumber, zoneNumber = '', property) {
  let devicePath = `device/${group}/${platformType}/room-${roomNumber}`;
  if (zoneNumber) {
    devicePath += `/zone-${zoneNumber}`;
  }
  devicePath += `/${property}`;

  const device = buildingSensors[devicePath];
  if (!device) return null;

  return {
    '@id': devicePath,
    ...building.sensor({
      ...device,
      observation: getObservation(roomNumber, zoneNumber, property),
      makeAndModel: 'https://mall.industry.siemens.com/mall/en/WW/Catalog/Products/10276905#'
    })
  };
}

module.exports = {
  loadFromApi,
  getFilteredRooms,
  getRoom,
  getZone,
  getObservation,
  getSensor
};
