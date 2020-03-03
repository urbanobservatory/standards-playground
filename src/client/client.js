let codeArea = null;
let schemaArea = null;
let controlArea = null;

window.addEventListener('load', () => {
  console.info('Client file loaded.');

  // Store DOM elements to output and dump controls in
  codeArea = document.getElementById('json-output');
  controlArea = document.getElementById('controls');
  schemaArea = document.getElementById('schema-output');

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

async function loadSchema(schemaIri, doc) {
  if (!schemaArea) return;

  if (!schemaIri) {
    schemaArea.innerHTML = 'Response is not a schema instance.';
    return;
  }

  schemaArea.innerHTML = 'Response is described by schema "<code>' + schemaIri + '</code>".';

  const schemaRoot = await walkFetchSchema(schemaIri);
  schemaArea.innerHTML += '<pre>' + JSON.stringify(schemaRoot, null, 2) + '</pre>';

  // Generate some control buttons for each of the links
  controlArea.innerHTML = '';
  controlArea.appendChild(
    walkLinks(schemaRoot, doc)
  );
}

function walkLinks(schema, doc) {
  const controlContainer = document.createElement('div');
  controlContainer.id = 'control-buttons';
  controlContainer.className = 'control-buttons';

  // Walk the schema and find all the link definitions...
  const links = [];

  const isIterable = k => ['allOf', 'oneOf'].indexOf(k) >= 0;

  const walk = (parent) => {
    Object
      .getOwnPropertyNames(parent)
      .forEach(k => {
        if (k === 'links') {
          links.push(...parent[k]);
        }
      });

    if (parent === Object(parent)) {
      Object
        .getOwnPropertyNames(parent)
        .forEach(k => {
          if (isIterable(k)) {
            parent[k].forEach((sub, idx) => walk(sub));
          }
        });
    }
  };
  walk(schema);

  // Generate a button for each link identified
  links.forEach(
    l => {
      const button = document.createElement('button');
      button.className = 'control-button';
      button.innerHTML = l.rel;

      controlContainer.appendChild(button);
      button.addEventListener('click', e => {
        activateLink(schema, doc, l);
      });
    }
  );

  return controlContainer;
}

function activateLink(schema, doc, link) {
  console.log('Should now be activating the link...', link);

  const {templatePointers, href} = link;
  const templateData = {};

  // Resolve pointers within the document
  Object
    .keys(templatePointers)
    .forEach(
      pointer => {
        templateData[pointer] = resolvePointer(doc, templatePointers[pointer]);
      }
    );

  // Should check the template data against the schema and disable any link
  // that doesn't validate (like negative offsets in pagination)
  // TODO: Validate the pointer references against their schema

  // Build a valid IRI
  // TODO: These can get fairly complex, need to cover all of the scenarios in the Hyper-Schema standard
  // This will undoubtedly break for many cases, but it's a demo...
  const hrefFilled = link.href.replace(
    /{([^\{]+)}/,
    // Get the groups surrounded by curly braces
    (substitutionGroup, idx) => {
      if (idx === 0) return ''; // Skip the all match

      // Get the contents of the braces that aren't special URL characters
      return substitutionGroup
        .replace(
          /[a-z0-9,]+/gi,
          substitution =>
            substitution
              .split(',')
              .map(parameter => {
                return parameter + '=' + templateData[parameter];
              })
              .join('&')
        );
    }
  ).replace(/[{}]/g, ''); // Strip the braces at the end

  // TODO: Use the URL and URL search params to build this address properly
  const currentLocation = window.location.toString().replace(/\?(.*)$/, '');
  window.location.hash = currentLocation.replace(window.location.origin + '/#', '') + hrefFilled;
}

function resolvePointer(document, pointer) {
  const path = pointer.split('/');

  // TODO: Handle relative pointers in addition to absolute pointers
  let cursor = document;
  path.forEach(
    p => {
      if (typeof cursor[p] === 'undefined') {
        return;
      }

      cursor = cursor[p]
    }
  );

  return cursor;
}

async function walkFetchSchema(schemaIri, baseIri) {
  const schemaUrl = new URL(schemaIri, baseIri || document.baseURI);
  const schemaRoot = await (await fetch(schemaIri)).json();
  const schemaRefs = [];
  const walk = (parent, key, depth = 1) => {
    if (parent[key] === Object(parent[key])) {
      Object
        .getOwnPropertyNames(parent[key])
        .forEach(k => walk(parent[key], k, depth + 1));
    } else {
      if (key === '$ref') {
        schemaRefs.push({
          parent,
          key,
          pointer: parent[key],
          fragment: parent[key].match(/#(.*)$/) || null,
          path: parent[key].match(/([^#]+)(#|$)/)[1] || null
        });
      }
    }
  };

  Object
    .getOwnPropertyNames(schemaRoot)
    .forEach(k => walk(schemaRoot, k));

  const loadedSchema = {};
  for await (const {parent, key, pointer, fragment, path} of schemaRefs) {
    const pointerUrl = new URL(path, schemaUrl).href;

    // Ignore relative pointers in the same document for now, no loading required
    // TODO: Transform pointers to the new base within the dereferenced document
    if (pointer.substr(0, 1) === '#') continue;

    if (!loadedSchema[pointerUrl]) {
      console.log('Loading referenced schema', pointerUrl);
      loadedSchema[pointerUrl] = await walkFetchSchema(pointerUrl);
    }

    delete parent[key];
    Object.assign(parent, loadedSchema[pointerUrl]);
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
