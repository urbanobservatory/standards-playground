const connector = require('./connector');
const building = require('./formatters');

const apiPort = process.env.PORT || 8080;
const apiBase = process.env.BASE || `http://localhost:${apiPort}/api/`;

const defaultOffset = 0;
const defaultLimit = 10;

const maxCollectionViewItems = 50;
const minCollectionViewItems = 1;

function getEntrypoint(req, res) {
  res
    .status(200)
    .json({
      '@context': [
        { '@base': apiBase },
        '/api/context/entry-point.json'
      ],
      '@id': '/api',
      ...building.entryPoint({
        buildingName: 'Urban Sciences Building'
      })
    });
}

function getRoomCollection(req, res) {
  const pagination = {
    offset: Math.max(
      !isNaN(req.query.offset) ? Number.parseInt(req.query.offset, 10) : defaultOffset,
      0
    ),
    limit: Math.min(
      Math.max(
        !isNaN(req.query.limit) ? Number.parseInt(req.query.limit, 10) : defaultLimit,
        minCollectionViewItems
      ),
      maxCollectionViewItems
    )
  };
  const filters = {}; // TODO: Support filters per https://github.com/urbanobservatory/standards/issues/18

  res
    .status(200)
    .json({
      '@context': [
        { '@base': apiBase },
        '/api/context/collection.json',
        '/api/context/building.json',
        '/api/context/observation.json',
        '/api/context/units.json',
        '/api/context/properties.json'
      ],
      '@id': '/api/room',
      ...building.collection({
        pageOffset: pagination.offset,
        pageLimit: pagination.limit,
        member: connector.getFilteredRooms(pagination, filters)
      })
    });
}

function getRoomIndividual(req, res) {
  const room = connector.getRoom(req.params.roomId);

  if (!room) {
    res
      .status(404)
      .send();
    return;
  }

  res
    .status(200)
    .json({
      '@context': [
        { '@base': apiBase },
        '/api/context/building.json',
        '/api/context/collection.json',
        '/api/context/observation.json',
        '/api/context/units.json',
        '/api/context/properties.json'
      ],
      '@id': `/api/room/${req.params.roomId}`,
      'memberOf': ['/api/room'],
      ...room
    });
}

function getZoneIndividual(req, res) {
  const zone = connector.getZone(req.params.roomId, req.params.zoneId);

  if (!zone) {
    res
      .status(404)
      .send();
    return;
  }

  res
    .status(200)
    .json({
      '@context': [
        { '@base': apiBase },
        '/api/context/building.json',
        '/api/context/observation.json',
        '/api/context/units.json',
        '/api/context/properties.json'
      ],
      '@id': `/api/room/${req.params.roomId}/zone-${req.params.zoneId}`,
      'isPartOf': `/api/room/${req.params.roomId}`,
      ...zone
    });
}

function getObservationIndividual(req, res) {
  const {roomId, zoneId, property} = req.params;
  const observation = connector.getObservation(roomId, zoneId, property);

  if (!observation) {
    res
      .status(404)
      .send();
    return;
  }

  res
    .status(200)
    .json({
      '@context': [
        { '@base': apiBase },
        '/api/context/building.json',
        '/api/context/observation.json',
        '/api/context/units.json',
        '/api/context/properties.json'
      ],
      '@id': `/api/observation/room-${roomId}-${zoneId ? `zone-${zoneId}-` : ''}${property}`,
      'hasFeatureOfInterest': `/api/room/${roomId}${zoneId ? `/zone-${zoneId}` : ''}`,
      ...observation
    });
}

function getSensorIndividual(req, res) {
  const {group, platformType, roomId, zoneId, sensorName} = req.params;
  const sensor = connector.getSensor(
    group,
    platformType,
    roomId,
    zoneId,
    sensorName
  );

  if (!sensor) {
    res
      .status(404)
      .send();
    return;
  }

  if (sensor.madeObservation) {
    sensor.madeObservation.hasFeatureOfInterest = `/api/room/${roomId}${zoneId ? `/zone-${zoneId}` : ''}`;
  }

  res
    .status(200)
    .json({
      '@context': [
        { '@base': apiBase },
        '/api/context/observation.json',
        '/api/context/units.json',
        '/api/context/properties.json',
        '/api/context/sensor.json'
      ],
      ...sensor
    });
}

module.exports = {
  getEntrypoint,
  getRoomCollection,
  getRoomIndividual,
  getZoneIndividual,
  getObservationIndividual,
  getSensorIndividual
};
