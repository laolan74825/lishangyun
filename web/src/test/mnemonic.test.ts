import { describe, it, expect } from 'vitest'
import { generateMnemonic, validateMnemonic, getWordlist, findWordSuggestions } from '../lib/mnemonic'

describe('mnemonic', () => {
  it('generates 12-word mnemonic', async () => {
    const mnemonic = await generateMnemonic(12)
    const words = mnemonic.split(' ')
    expect(words.length).toBe(12)
  })

  it('generates 24-word mnemonic', async () => {
    const mnemonic = await generateMnemonic(24)
    const words = mnemonic.split(' ')
    expect(words.length).toBe(24)
  })

  it('generates different mnemonics each time', async () => {
    const m1 = await generateMnemonic(12)
    const m2 = await generateMnemonic(12)
    expect(m1).not.toBe(m2)
  })

  it('all words are from BIP-39 wordlist', async () => {
    const wordlist = getWordlist()
    const mnemonic = await generateMnemonic(12)
    const words = mnemonic.split(' ')

    for (const word of words) {
      expect(wordlist).toContain(word)
    }
  })

  it('validates correct mnemonic', async () => {
    const mnemonic = await generateMnemonic(12)
    expect(validateMnemonic(mnemonic)).toBe(true)
  })

  it('rejects invalid word count', () => {
    expect(validateMnemonic('abandon ability able')).toBe(false)
    expect(validateMnemonic('')).toBe(false)
  })

  it('rejects invalid words', () => {
    const invalid = 'abandon ability able about above absent absorb abstract absurd abuse access notaword'
    expect(validateMnemonic(invalid)).toBe(false)
  })

  it('rejects invalid checksum', () => {
    const words = 'abandon ability able about above absent absorb abstract absurd abuse access accident'
    const shuffled = words.split(' ').reverse().join(' ')
    expect(validateMnemonic(shuffled)).toBe(false)
  })

  it('getWordlist returns 2048 words', () => {
    const wordlist = getWordlist()
    expect(wordlist.length).toBe(2048)
  })

  it('findWordSuggestions returns matching words', () => {
    const suggestions = findWordSuggestions('aban', 5)
    expect(suggestions).toContain('abandon')
    expect(suggestions.length).toBeLessThanOrEqual(5)
  })

  it('findWordSuggestions returns empty for no match', () => {
    const suggestions = findWordSuggestions('xyz', 5)
    expect(suggestions.length).toBe(0)
  })
})
