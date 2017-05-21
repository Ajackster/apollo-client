import {
  NormalizedCache,
  Cache,
  QueryCache,
  QueryCacheValue, QueryCacheState,
} from './storeUtils';

import { isEqual } from '../util/isEqual';

export function invalidateQueryCache({
  store,
  queryCache,
  updatedKeys,
  omitQueryIds,
}: {
  store: NormalizedCache,
  queryCache: QueryCache,
  updatedKeys?: { [id: string]: any } | null,
  omitQueryIds?: string[],
}): Cache {
  const updatedQueryIds = Object.keys(queryCache).filter(
    queryId => (!omitQueryIds || omitQueryIds.indexOf(queryId) < 0) && (!updatedKeys || Object.keys(queryCache[queryId].keys).some(
      id => !!updatedKeys[id])),
  );

  if (!updatedQueryIds.length) {
    return {
      data: store,
      queryCache,
    };
  }

  const newQueryCache = {...queryCache};
  updatedQueryIds.forEach(queryId => {
    if (newQueryCache[queryId].state !== 'dirty') {
      newQueryCache[queryId].state = 'stale';
    }
  });

  return {
    data: store,
    queryCache: newQueryCache,
  };
}

export function removeQueryFromCache({
  queryId,
  store,
  queryCache,
}: {
  queryId: string,
  store: NormalizedCache,
  queryCache: QueryCache,
}): Cache {
  const newQueryCache = { ...queryCache };
  delete newQueryCache[queryId];

  return {
    data: store,
    queryCache: newQueryCache,
  };
}

export function insertQueryIntoCache({
  queryId,
  result,
  variables = {},
  store,
  queryCache,
  keys,
  updatedKeys,
  state = 'fresh',
}: {
  queryId: string,
  result: any,
  variables?: Object,
  store: NormalizedCache,
  queryCache: QueryCache,
  keys: { [id: string]: any },
  updatedKeys?: { [id: string]: any },
  state?: QueryCacheState,
}): Cache {
  if (!keys || !Object.keys(keys).length) {
    throw new Error(`Trying to insert query ${queryId} into query cache but no query cache keys are specified`);
  }

  const cache = updatedKeys && Object.keys(updatedKeys).length ?
    invalidateQueryCache({store, queryCache, updatedKeys, omitQueryIds: [queryId]}) :
    {
      data: store,
      queryCache,
    };

  return {
    data: cache.data,
    queryCache: {
      ...cache.queryCache,
      [queryId]: mergeQueryCacheValue({
        result,
        keys,
        variables,
        state,
      }, cache.queryCache[queryId]),
    },
  };
}

export function readQueryFromCache({
  queryId,
  queryCache,
  variables = {},
}: {
  queryId: string,
  queryCache: QueryCache,
  variables?: Object,
}): {
  result: any,
  dirty: boolean,
} {
  const cachedQuery = queryCache[queryId];
  if (!cachedQuery) {
    return {
      result: null,
      dirty: false,
    };
  }

  const result = cachedQuery.state !== 'stale' && isEqual(variables, cachedQuery.variables) ? cachedQuery.result : null;

  return {
    result: result,
    dirty: cachedQuery.state === 'dirty',
  };
}

function mergeQueryCacheValue(newQueryCacheValue: QueryCacheValue, oldQueryCacheValue: QueryCacheValue): QueryCacheValue {
  if (!oldQueryCacheValue) {
    return newQueryCacheValue;
  }

  newQueryCacheValue.result = mergeObject(newQueryCacheValue.result, oldQueryCacheValue.result);

  return newQueryCacheValue;
}

function mergeObject(target: any, source: any): any {
  if (target === source) {
    return source;
  }

  if (target != null && typeof target === 'object' && source != null && typeof source === 'object') {
    let targetFrozen = null;
    let differingKey = false;

    for (const key in target) {
      if (target.hasOwnProperty(key)) {
        if (!source.hasOwnProperty(key)) {
          return target;
        }

        const result = mergeObject(target[key], source[key]);
        if (result !== source[key]) {
          differingKey = true;
        } else {
          // Normally result is not frozen as it's delivered from a network query. However, when it's constructed by data delivered to the
          // user (e.g. in QueryManager when caching a result before delivered to the user or through extra reducers) it may be frozen. In
          // this case we must clone the result so that we are able to preserve as much referential equality as possible when merging with
          // the previous result.

          if (targetFrozen === null) {
            targetFrozen = Object.isFrozen(target);
          }
          if (targetFrozen) {
            target = {...target};
            targetFrozen = false;
          }
          target[key] = result;
        }
      }
    }

    if (differingKey) {
      return target;
    }

    for (const key in source) {
      if (!target.hasOwnProperty(key)) {
        return target;
      }
    }

    return source;
  }

  return target;
}
