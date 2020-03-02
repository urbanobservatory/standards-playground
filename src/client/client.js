let codeArea = null;
let schemaArea = null;

window.addEventListener('load', () => {
  console.info('Client file loaded.');

  // Store DOM elements to output and dump controls in
  codeArea = document.getElementById('json-output');
  schemaArea = document.getElementById('controls');

  loadFragment();
});

window.addEventListener('hashchange', () => {
  loadFragment();
});

function loadFragment () {
  // Fetch API entry point by default, otherwise the hash
  const fragment = window.location.hash.substr(1);

  if (fragment.length) {
    console.info(`Fragment has changed. Loading ${fragment}`);
    renderDocument(fragment);
  } else {
    console.info(`No API path in fragment. Loading entry point at /api.`);
    renderDocument('/api');
  }
}

async function loadDocument(iri) {
  let queryResponse = null;
  let querySchema = null;

  try {
    queryResponse = await fetch(
      iri.indexOf('//') < 0 ? window.location.origin + iri : iri,
      {}
    );

    const contentType = queryResponse.headers.get('Content-Type');

    // This is not a good approach, it's hacky and it will definitely not work in all cases
    // TODO: Improve this by properly parsing the Content-Type header for all valid options
    if (contentType.toLowerCase().indexOf('schema-instance') >= 0) {
      querySchema = contentType.match(/schema="([^"]+)"/)[1] || null;
    }

    queryResponse = await queryResponse.json();
  } catch (e) {
    return e.message;
  }

  const context = queryResponse['@context'];

  await loadSchema(querySchema, queryResponse);

  // Just return it as is, if it's not a JSON-LD document
  if (!context || !context.length) {
    return queryResponse;
  }

  const expansion = await jsonld.expand(queryResponse, {
    base: window.location.origin
  });

  const removeBase = modifiedContext => {
    Object.keys(modifiedContext).forEach(
      key => {
        if (key === '@base') {
          delete modifiedContext[key];
        }
        if (typeof modifiedContext[key] === 'object' && context[key] !== null) {
          removeBase(modifiedContext[key]);
        }
      }
    );
    return modifiedContext;
  };
  const baselessContext = removeBase(
    context.map(c => Object.prototype.toString.call(c) === '[object String]' ?
      (window.location.origin + c) :
      c
    )
  );

  return await jsonld.compact(expansion, baselessContext);
}

async function loadSchema(schemaIri, document) {
  if (!schemaArea) return;

  if (!schemaIri) {
    schemaArea.innerHTML = 'Response is not a schema instance.';
    return;
  }

  schemaArea.innerHTML = 'Response is described by schema "<code>' + schemaIri + '</code>".';

  const schemaRoot = await walkFetchSchema(schemaIri);
  schemaArea.innerHTML += '<pre>' + JSON.stringify(schemaRoot, null, 2) + '</pre>';
}

async function walkFetchSchema(schemaIri) {
  const schemaRoot = await (await fetch(schemaIri)).json();
  const schemaRefs = [];
  const walk = (parent, key, depth = 1) => {
    console.log(key);
    if (parent[key] === Object(parent[key])) {
      Object
        .getOwnPropertyNames(parent[key])
        .forEach(k => walk(parent[key], k, depth + 1));
    } else {
      if (key === '$ref') {
        schemaRefs.push({
          parent,
          key,
          pointer: parent[key]
        });
      }
    }
  };

  Object
    .getOwnPropertyNames(schemaRoot)
    .forEach(k => walk(schemaRoot, k));

  console.log(schemaRefs);

  for await (let reference of schemaRefs) {
    console.log(reference.pointer);
  }

  return schemaRoot;
}

async function renderDocument(iri) {
  if (!codeArea) return;

  codeArea.innerHTML = 'Loading...';
  const doc = await loadDocument(iri);

  if (!doc || typeof doc === 'string') {
    codeArea.innerHTML = doc || 'Unable to load.';
    return;
  }

  const json = prettyPrintJson.toHtml(doc, {
    indent: 4,
    quoteKeys: true
  });

  // Turn full IRIs into links but trim off the current origin if we can
  codeArea.innerHTML = json.replace(/"([^:"]+:\/\/[^"]+)"/gi, (allMatch, iri) => {
    const shortIri = iri.indexOf(window.location.origin) === 0 ?
      iri.substr(window.location.origin.length) :
      iri;
    return '"<a href="#' + shortIri + '">' + iri + '</a>"';
  });
}
