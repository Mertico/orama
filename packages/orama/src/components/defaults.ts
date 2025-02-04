import { createError } from '../errors.js'
import { ArraySearchableType, Document, ElapsedTime, ScalarSearchableType, Schema, SearchableType } from '../types.js'
import { uniqueId, formatNanoseconds } from '../utils.js'

export { getDocumentProperties } from '../utils.js'

export async function formatElapsedTime(n: bigint): Promise<ElapsedTime> {
  return {
    raw: Number(n),
    formatted: await formatNanoseconds(n),
  }
}

export async function getDocumentIndexId(doc: Document): Promise<string> {
  if (doc.id) {
    if (typeof doc.id !== 'string') {
      throw createError('DOCUMENT_ID_MUST_BE_STRING', typeof doc.id)
    }

    return doc.id
  }

  return await uniqueId()
}

export async function validateSchema<S extends Schema = Schema>(doc: Document, schema: S): Promise<string | undefined> {
  for (const [prop, type] of Object.entries(schema)) {
    const value = doc[prop]
    const typeOfValue = typeof value

    if (typeOfValue === 'undefined') {
      continue
    }

    const typeOfType = typeof type

    if (isVectorType(type as string)) {
      const vectorSize = getVectorSize(type as string)
      if (!Array.isArray(value) || value.length !== vectorSize) {
        throw createError('INVALID_INPUT_VECTOR', prop, vectorSize, (value as number[]).length)
      }
      continue
    }

    if (typeOfType === 'string' && isArrayType(type as SearchableType)) {
      if (!Array.isArray(value)) {
        return prop
      }
      const expectedType = getInnerType(type as ArraySearchableType)

      const valueLength = value.length
      for (let i = 0; i < valueLength; i++) {
        if (typeof value[i] !== expectedType) {
          return prop + '.' + i
        }
      }

      continue
    }

    if (typeOfType === 'object') {
      if (!value || typeOfValue !== 'object') {
        return prop
      }

      const subProp = await validateSchema(value as Document, type as Schema)
      if (subProp) {
        return prop + '.' + subProp
      }
      continue
    }

    if (typeOfValue !== type) {
      return prop
    }
  }

  return undefined
}

const IS_ARRAY_TYPE: Record<SearchableType, boolean> = {
  string: false,
  number: false,
  boolean: false,
  'string[]': true,
  'number[]': true,
  'boolean[]': true,
}

const INNER_TYPE: Record<ArraySearchableType, ScalarSearchableType> = {
  'string[]': 'string',
  'number[]': 'number',
  'boolean[]': 'boolean',
}

export function isVectorType(type: string): boolean {
  return /^vector\[\d+\]$/.test(type)
}

export function isArrayType(type: SearchableType): boolean {
  return IS_ARRAY_TYPE[type]
}

export function getInnerType(type: ArraySearchableType): ScalarSearchableType {
  return INNER_TYPE[type]
}

export function getVectorSize(type: string): number {
  const size = Number(type.slice(7, -1))

  switch (true) {
    case isNaN(size):
      throw createError('INVALID_VECTOR_VALUE', type)
    case size <= 0:
      throw createError('INVALID_VECTOR_SIZE', type)
    default:
      return size
  }
}