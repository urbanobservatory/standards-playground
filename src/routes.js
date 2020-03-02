const express = require('express');
const path = require('path');

const endpoints = require('./endpoints');

function registerEndpoints(app) {
  // Entry point
  app.get('/api', endpoints.getEntrypoint);

  // A collection of rooms
  app.get('/api/room', endpoints.getRoomCollection);

  // An individual room
  app.get('/api/room/:roomId', endpoints.getRoomIndividual);

  // An individual zone
  app.get('/api/room/:roomId/zone-:zoneId', endpoints.getZoneIndividual);

  // An individual observation
  app.get('/api/observation/room-:roomId-zone-:zoneId-:property', endpoints.getObservationIndividual);
  app.get('/api/observation/room-:roomId-:property', endpoints.getObservationIndividual);

  // An individual sensor
  app.get('/api/device/:group/:platformType/room-:roomId/:sensorName', endpoints.getSensorIndividual);
  app.get('/api/device/:group/:platformType/room-:roomId/zone-:zoneId/:sensorName', endpoints.getSensorIndividual);
}

function registerStatic(app) {
  // Allow access to the client files for browsers and context JSON files
  app.use('/', express.static(path.join(__dirname, 'client'), { index: 'index.htm' }));
  app.use('/api/context', express.static(path.join(__dirname, 'context')));
  app.use('/api/schema', express.static(path.join(__dirname, 'schema'), {
    setHeaders: (res, path, stat) => {
      res.set('Content-Type', 'application/schema+json')
    }
  }));
}

module.exports = {
  registerStatic,
  registerEndpoints
};
