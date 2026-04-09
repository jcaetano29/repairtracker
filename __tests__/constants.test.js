import { getNivelRetraso, formatNumeroOrden, ESTADOS, TRANSICIONES } from '@/lib/constants'

describe('getNivelRetraso', () => {
  it('returns none when under leve threshold', () => {
    expect(getNivelRetraso('INGRESADO', 1)).toBe('none')
  })
  it('returns leve at leve threshold', () => {
    expect(getNivelRetraso('INGRESADO', 2)).toBe('leve')
  })
  it('returns grave at grave threshold', () => {
    expect(getNivelRetraso('INGRESADO', 5)).toBe('grave')
  })
  it('returns none for states without thresholds', () => {
    expect(getNivelRetraso('ENTREGADO', 100)).toBe('none')
  })
})

describe('formatNumeroOrden', () => {
  it('pads single digit to 4 chars', () => {
    expect(formatNumeroOrden(1)).toBe('0001')
  })
  it('does not truncate 5+ digit numbers', () => {
    expect(formatNumeroOrden(12345)).toBe('12345')
  })
})

describe('8-state structure', () => {
  it('has exactly 8 states', () => {
    expect(Object.keys(ESTADOS)).toHaveLength(8);
  });

  it('does not contain removed states', () => {
    expect(ESTADOS).not.toHaveProperty('ESPERANDO_PRESUPUESTO');
    expect(ESTADOS).not.toHaveProperty('PRESUPUESTO_RECIBIDO');
    expect(ESTADOS).not.toHaveProperty('ENVIADO_A_TALLER');
  });

  it('contains EN_TALLER instead of ENVIADO_A_TALLER', () => {
    expect(ESTADOS).toHaveProperty('EN_TALLER');
  });

  it('INGRESADO transitions to EN_TALLER and EN_REPARACION only', () => {
    expect(TRANSICIONES.INGRESADO).toEqual(
      expect.arrayContaining(['EN_TALLER', 'EN_REPARACION'])
    );
    expect(TRANSICIONES.INGRESADO).not.toContain('ESPERANDO_PRESUPUESTO');
    expect(TRANSICIONES.INGRESADO).not.toContain('ENVIADO_A_TALLER');
  });

  it('ESPERANDO_APROBACION transitions to LISTO_EN_TALLER and RECHAZADO', () => {
    expect(TRANSICIONES.ESPERANDO_APROBACION).toEqual(
      expect.arrayContaining(['LISTO_EN_TALLER', 'RECHAZADO'])
    );
  });
})
