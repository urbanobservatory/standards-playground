let codeArea = null;

window.addEventListener('load', () => {
  console.info('Client file loaded.');

  // Store DOM elements to output and dump controls in
  codeArea = document.getElementById('json-output');

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

  try {
    queryResponse = await jsonld.get(
      iri.indexOf('//') < 0 ? window.location.origin + iri : iri,
      {}
    );
  } catch (e) {
    return e.message;
  }

  const context = queryResponse.document['@context'];

  // Just return it as is, if it's not a JSON-LD document
  if (!context || !context.length) {
    return queryResponse.document;
  }

  const expansion = await jsonld.expand(queryResponse.document, {
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
