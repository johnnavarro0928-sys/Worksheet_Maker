import { describe, expect, it } from 'vitest';
import { stripAnswerLabelPrefixes } from './answerOptionLabels';

describe('stripAnswerLabelPrefixes', () => {
  it('removes option labels when an option set clearly carries answer labels', () => {
    expect(stripAnswerLabelPrefixes([
      'A. Surface area and decreasing concentration',
      'B) Temperature and concentration',
      'Option C: Presence of a catalyst',
      'D - Pressure and nature of reactants',
    ])).toEqual([
      'Surface area and decreasing concentration',
      'Temperature and concentration',
      'Presence of a catalyst',
      'Pressure and nature of reactants',
    ]);
  });

  it('does not strip ordinary text or isolated scientific abbreviations from an unlabeled option set', () => {
    expect(stripAnswerLabelPrefixes([
      'D. melanogaster is a model organism',
      'Yeast cells',
      'E. coli bacteria',
      'D-glucose is a sugar',
    ])).toEqual([
      'D. melanogaster is a model organism',
      'Yeast cells',
      'E. coli bacteria',
      'D-glucose is a sugar',
    ]);
  });
});
