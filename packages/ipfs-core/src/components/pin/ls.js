'use strict'

const PinManager = require('./pin-manager')
const { PinTypes } = PinManager
const normaliseInput = require('ipfs-core-utils/src/pins/normalise-input')
const { resolvePath } = require('../../utils')
const withTimeoutOption = require('ipfs-core-utils/src/with-timeout-option')

function toPin (type, cid, metadata) {
  const output = {
    type,
    cid
  }

  if (metadata) {
    output.metadata = metadata
  }

  return output
}

/**
 * @param {import('.').Context} context
 * @param {import('ipfs-core-types/src/pin').ListOptions} [options]
 * @returns {AsyncIterable<import('ipfs-core-types/src/pin').PinEntry>}
 */
async function * ls ({ pinManager, dagReader }, options = {}) {
  /** @type {import('ipfs-core-types/src/pin').PinQueryType} */
  let type = PinTypes.all

  if (options.type) {
    type = options.type
    if (typeof options.type === 'string') {
      // @ts-ignore - Can't infer that string returned by toLowerCase() is PinQueryType
      type = options.type.toLowerCase()
    }

    PinManager.checkPinType(type)
  } else {
    options.type = PinTypes.all
  }

  if (options.paths) {
    // check the pinned state of specific hashes
    let matched = false

    for await (const { path } of normaliseInput(options.paths)) {
      const cid = await resolvePath(dagReader, path)
      const { reason, pinned, parent, metadata } = await pinManager.isPinnedWithType(cid, type)

      if (!pinned) {
        throw new Error(`path '${path}' is not pinned`)
      }

      switch (reason) {
        case PinTypes.direct:
        case PinTypes.recursive:
          matched = true
          yield toPin(reason, cid, metadata)
          break
        default:
          matched = true
          yield toPin(`${PinTypes.indirect} through ${parent}`, cid, metadata)
      }
    }

    if (!matched) {
      throw new Error('No match found')
    }

    return
  }

  if (type === PinTypes.recursive || type === PinTypes.all) {
    for await (const { cid, metadata } of pinManager.recursiveKeys()) {
      yield toPin(PinTypes.recursive, cid, metadata)
    }
  }

  if (type === PinTypes.indirect || type === PinTypes.all) {
    // @ts-ignore - LsSettings & AbortOptions have no properties in common
    // with type { preload?: boolean }
    for await (const cid of pinManager.indirectKeys(options)) {
      yield toPin(PinTypes.indirect, cid)
    }
  }

  if (type === PinTypes.direct || type === PinTypes.all) {
    for await (const { cid, metadata } of pinManager.directKeys()) {
      yield toPin(PinTypes.direct, cid, metadata)
    }
  }
}

module.exports = withTimeoutOption(ls)
