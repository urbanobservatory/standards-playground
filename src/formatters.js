const entryPoint = (elements) => ({
  'title': `Demonstrator API for the ${elements.buildingName}`,
  'collections': [
    'room'
  ]
});

const collection = (elements) => ({
  '@type': ['Container', 'Collection', 'CollectionPartialView'],
  'title': 'Rooms',
  'description': 'Collection of rooms and bookable communal spaces in the building',
  'member': elements.member,
  'meta': {
    '@type': 'CollectionMeta',
    'current': {
      '@type': 'CollectionPointer',
      'offset': elements.pageOffset,
      'limit': elements.pageLimit
    },
    'prev': {
      '@type': 'CollectionPointer',
      'offset': elements.pageOffset - elements.pageLimit
    },
    'next': {
      '@type': 'CollectionPointer',
      'offset': elements.pageOffset + elements.pageLimit
    }
  }
});

const room = (elements) => ({
  '@type': elements.isFeatureOfInterestOf ?
    ['FeatureOfInterest', 'Room'] :
    ['Room'],
  'title': `Room ${elements.roomNumber}`,
  'identifier': elements.roomNumber,
  'hasPart': elements.zones,
  'isFeatureOfInterestOf': (elements.isFeatureOfInterestOf && Object.keys(elements.isFeatureOfInterestOf).length) ?
    elements.isFeatureOfInterestOf :
    undefined
});

const zone = (elements) => ({
  '@type': ['FeatureOfInterest', 'Zone'],
  'title': `Room ${elements.roomNumber} Zone ${elements.zoneNumber}`,
  'identifier': `${elements.roomNumber}Z${elements.zoneNumber}`,
  'isFeatureOfInterestOf': (elements.isFeatureOfInterestOf && Object.keys(elements.isFeatureOfInterestOf).length) ?
    elements.isFeatureOfInterestOf :
    undefined
});

const observation = (elements) => ({
  '@type': 'Observation',
  'hasResult': elements.result.value ? {
    '@type': elements.result.type,
    '@value': elements.result.value
  } : undefined,
  'observedProperty': elements.property,
  'madeBySensor': elements.sensor,
  'resultTime': elements.result.time
});

const platform = (elements) => ({

});

const sensor = (elements) => ({
  '@type': 'Sensor',
  'madeObservation': elements.observation,
  'observes': elements.property,
  'hasMakeAndModel': elements.makeAndModel
});

module.exports = {
  entryPoint,
  collection,
  room,
  zone,
  observation,
  platform,
  sensor
};
