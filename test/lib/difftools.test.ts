import * as difftools from '../../src/lib/difftools'
import {expect} from 'chai'

describe('difftools', () => {
  describe('isArrayOfStrings', () => {
    const tt: [string, any, boolean][] = [
      ['single string list should pass', ['foo'], true],
      ['multi string list should pass', ['foo', 'bar', 'baz'], true],
      ['mixed string list should fail', ['foo', 'bar', 123, 'baz'], false],
      ['object should fail', {}, false],
      ['string should fail', 'foo', false],
      ['number should fail', 123, false],
      ['null should fail', null, false],
      ['set of strings should fail', new Set(['foo']), false],
      ['empty list should fail', [], false],
    ]

    for (const [desc, input, result] of tt) {
      it(desc, () => {
        expect(difftools.isArrayOfStrings(input)).to.equal(result)
      })
    }
  })

  describe('objectBackedSet', () => {
    it('converting to and from results in the same list in sorted order', () => {
      const input = ['foo', 'bar', 'baz']
      const intermediate = difftools.stringArrayToObjectBackedSet(input)
      const output = difftools.objectBackedSetToStringArray(intermediate)

      expect(output).to.deep.equal(['bar', 'baz', 'foo'])
    })

    it('handles undefined inputs', () => {
      const input = undefined
      expect(difftools.stringArrayToObjectBackedSet(input)).to.deep.equal(undefined)
      expect(difftools.objectBackedSetToStringArray(input)).to.deep.equal(undefined)
    })

    it('converting to and from removes duplicates', () => {
      const input = ['foo', 'bar', 'baz', 'foo', 'baz', 'foo', 'bar']
      const intermediate = difftools.stringArrayToObjectBackedSet(input)
      const output = difftools.objectBackedSetToStringArray(intermediate)

      expect(output).to.deep.equal(['bar', 'baz', 'foo'])
    })
  })

  describe('deeply converting between strings and sets', () => {
    it('results in the same input', () => {
      const mutatedInput = {
        foo: ['a', 'b', 'c'],
      }
      difftools.deeplyConvertStringListsToSets(mutatedInput)
      difftools.deeplyConvertSetsToStringLists(mutatedInput)

      expect(mutatedInput).to.deep.equal({foo: ['a', 'b', 'c']})
    })

    it('doesn\'t transform regular objects', () => {
      const mutatedInput = {
        foo: {bar: 123, baz: 456},
      }
      difftools.deeplyConvertStringListsToSets(mutatedInput)
      difftools.deeplyConvertSetsToStringLists(mutatedInput)

      expect(mutatedInput).to.deep.equal({foo: {bar: 123, baz: 456}})
    })

    it('doesn\'t transform empty lists and objects', () => {
      const mutatedInput = {
        foo: {},
        bar: [],
      }
      difftools.deeplyConvertStringListsToSets(mutatedInput)
      difftools.deeplyConvertSetsToStringLists(mutatedInput)

      expect(mutatedInput).to.deep.equal({foo: {}, bar: []})
    })
  })

  describe('deeplySortLists', () => {
    it('deeply sorts', () => {
      const mutatedInput = {
        foo: ['c', 'b', 'a'],
        bar: {
          baz: ['z', 'x'],
        },
      }
      const expectedOutput = {
        foo: ['a', 'b', 'c'],
        bar: {
          baz: ['x', 'z'],
        },
      }

      difftools.deeplySortLists(mutatedInput)

      expect(mutatedInput).to.deep.equal(expectedOutput)
    })
  })

  describe('replaceUndefinedValuesWithDeletedValues', () => {
    it('succeeds', () => {
      const mutatedInput = {
        foo: {
          c: undefined,
        },
      }

      const current = {
        foo: {
          a: true,
          b: true,
          c: true,
        },
      }

      difftools.replaceUndefinedValuesWithDeletedValues(mutatedInput, current)

      expect(mutatedInput).to.deep.equal({foo: {c: true}})
    })
  })
})
