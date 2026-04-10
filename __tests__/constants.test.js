import { getNivelRetraso, formatNumeroOrden, ESTADOS, TRANSICIONES } from '@/lib/constants'

describe('getNivelRetraso with dynamic thresholds', () => {
  // Sample thresholds object from database
  const umbrales = {
    umbral_ingresado:            { leve: 2,  grave: 5  },
    umbral_en_taller:            { leve: 7,  grave: 14 },
    umbral_esperando_aprobacion: { leve: 1,  grave: 3  },
    umbral_en_reparacion:        { leve: 3,  grave: 7  },
    umbral_listo_en_taller:      { leve: 1,  grave: 3  },
    umbral_listo_para_retiro:    { leve: 3,  grave: 7  },
  }

  describe('threshold evaluation', () => {
    it('returns "none" when days < leve threshold', () => {
      expect(getNivelRetraso('INGRESADO', 1, umbrales)).toBe('none')
    })

    it('returns "leve" when days >= leve threshold', () => {
      expect(getNivelRetraso('INGRESADO', 2, umbrales)).toBe('leve')
    })

    it('returns "grave" when days >= grave threshold', () => {
      expect(getNivelRetraso('INGRESADO', 5, umbrales)).toBe('grave')
    })

    it('prefers "grave" over "leve" when both thresholds met', () => {
      expect(getNivelRetraso('INGRESADO', 10, umbrales)).toBe('grave')
    })
  })

  describe('state name transformation', () => {
    it('transforms "INGRESADO" to "umbral_ingresado" key', () => {
      expect(getNivelRetraso('INGRESADO', 2, umbrales)).toBe('leve')
    })

    it('transforms "EN_TALLER" to "umbral_en_taller" key', () => {
      expect(getNivelRetraso('EN_TALLER', 7, umbrales)).toBe('leve')
    })

    it('transforms "ESPERANDO_APROBACION" to "umbral_esperando_aprobacion" key', () => {
      expect(getNivelRetraso('ESPERANDO_APROBACION', 1, umbrales)).toBe('leve')
    })
  })

  describe('null/undefined handling', () => {
    it('returns "none" when umbrales is null', () => {
      expect(getNivelRetraso('INGRESADO', 5, null)).toBe('none')
    })

    it('returns "none" when umbrales is undefined', () => {
      expect(getNivelRetraso('INGRESADO', 5, undefined)).toBe('none')
    })

    it('returns "none" when state key does not exist in umbrales', () => {
      expect(getNivelRetraso('ENTREGADO', 100, umbrales)).toBe('none')
    })

    it('returns "none" when umbrales is empty object', () => {
      expect(getNivelRetraso('INGRESADO', 5, {})).toBe('none')
    })
  })

  describe('edge cases', () => {
    it('handles zero days correctly', () => {
      expect(getNivelRetraso('INGRESADO', 0, umbrales)).toBe('none')
    })

    it('works with different states', () => {
      expect(getNivelRetraso('EN_REPARACION', 3, umbrales)).toBe('leve')
      expect(getNivelRetraso('EN_REPARACION', 7, umbrales)).toBe('grave')
    })
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
