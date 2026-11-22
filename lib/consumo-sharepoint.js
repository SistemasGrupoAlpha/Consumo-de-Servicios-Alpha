'use strict';

const { g, need } = require('./graph');

const defaultLists = {
  SP_LIST_USERS: 'ConsumoUsuarios',
  SP_LIST_EDIFICIOS: 'Edificios',
  SP_LIST_LOCALES: 'Locales',
  SP_LIST_MEDIDORES: 'Medidores',
  SP_LIST_LECTURAS: 'LecturasMedidores',
  SP_LIST_ACCESOS: 'AccesosEdificios',
};

let resolvedSite;

async function siteId() {
  if (process.env.SP_SITE_ID) return process.env.SP_SITE_ID;
  if (!resolvedSite) {
    const url = process.env.SP_SITE_URL || `https://${need('SP_HOSTNAME')}${need('SP_SITE_PATH')}`;
    const site = new URL(url);
    resolvedSite = g(`/sites/${site.hostname}:${site.pathname.replace(/\/$/, '')}`)
      .then(result => result.id)
      .catch(error => { resolvedSite = undefined; throw error; });
  }
  return resolvedSite;
}

const guid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const listDirectories = new Map();
const ttl = 5 * 60 * 1000;

function listDirectory(site) {
  const cached = listDirectories.get(site);
  if (cached?.expires > Date.now()) return cached.promise;
  const entry = { expires: Date.now() + ttl };
  entry.promise = (async () => {
    const lists = [];
    let next = `/sites/${encodeURIComponent(site)}/lists?$select=id,displayName,webUrl`;
    while (next) {
      const page = await g(next);
      lists.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return lists;
  })().catch(error => {
    if (listDirectories.get(site) === entry) listDirectories.delete(site);
    throw error;
  });
  listDirectories.set(site, entry);
  return entry.promise;
}

async function listId(site, variable) {
  const list = process.env[variable]?.trim() || defaultLists[variable] || need(variable);
  if (guid.test(list)) return list;
  const lists = await listDirectory(site);
  const name = list.toLowerCase();
  const matches = lists.filter(candidate => {
    if (!candidate.webUrl) return false;
    const path = new URL(candidate.webUrl).pathname.replace(/\/$/, '');
    return decodeURIComponent(path.split('/').pop()).toLowerCase() === name;
  });
  const found = matches.length ? matches : lists.filter(candidate => candidate.displayName?.toLowerCase() === name);
  if (found.length !== 1) throw Object.assign(new Error(`Verificá el ID de la lista en ${variable}.`), { status: 500 });
  return found[0].id;
}

module.exports = { siteId, listId };
