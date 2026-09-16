import { describe, expect, it } from 'vitest'
import { UniquenessAuditService } from './UniquenessAuditService'

const baseScript = `# Die Fabrik

Am Ende der achtziger Jahre arbeiteten mehr als 7.000 Menschen für die Uhrenwerke Ruhla.

## Aufstieg
Die Stadt lebte vom Werk.

## Krise
Dann kamen die Schließungen.

## Ende
Heute stehen noch Mauern. Noch Schilder. Noch Erinnerungen.
`

describe('UniquenessAuditService', () => {
  it('aprova o primeiro roteiro do nicho', () => {
    const result = UniquenessAuditService.auditUniqueness(
      { title: 'Fabrica', content: baseScript },
      [],
    )
    expect(result.passed).toBe(true)
    expect(result.originalityScore).toBe(100)
  })

  it('reprova cópia estrutural proposital', () => {
    const clone = baseScript
      .replace('Ruhla', 'Glashütte')
      .replace('7.000', '5.400')
      .replace('Uhrenwerke', 'Porzellanwerke')

    const result = UniquenessAuditService.auditUniqueness(
      { title: 'Clone', content: clone },
      [{ title: 'Original', content: baseScript }],
    )

    expect(result.passed).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.structuralSimilarity).toBeGreaterThan(40)
  })

  it('detecta risco de troca de tema (genericidade estrutural)', () => {
    const a = `# Episodio A

Im Jahr 1989 arbeiteten 8000 Menschen in der Fabrik.

## Gegenwart
Die Stadt ist still.

## Vergangenheit
Früher war alles voll.

## Schluss
Heute stehen Ruinen.
`
    const b = `# Episodio B

Im Jahr 1991 arbeiteten 6200 Menschen in der Fabrik.

## Gegenwart
Die Stadt ist still.

## Vergangenheit
Früher war alles voll.

## Schluss
Heute stehen Ruinen.
`

    const result = UniquenessAuditService.auditUniqueness(
      { title: 'B', content: b },
      [{ title: 'A', content: a }],
    )
    expect(result.passed).toBe(false)
    expect(result.themeSwapRisk || result.genericTemplateRisk || result.issues.length > 0).toBe(
      true,
    )
  })

  it('extrai fingerprint editorial', () => {
    const fp = UniquenessAuditService.extractEditorialFingerprint(
      baseScript,
      'Die Fabrik',
      'tema',
    )
    expect(fp.openingType).toBeTruthy()
    expect(fp.endingType).toBeTruthy()
    expect(fp.avoidNext.length).toBeGreaterThan(0)
  })
})
