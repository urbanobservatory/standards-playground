const express = require('express');

const routes = require('./routes');
const connector = require('./connector');

const app = new express();
const apiPort = process.env.PORT || 8080;

routes.registerEndpoints(app);
routes.registerStatic(app);

app.listen(apiPort);
console.info(`Now listening on port ${apiPort}.`);

connector
  .loadFromApi()
  .then(() => {
    console.info('Finished loading source data from USB API.');
  });
