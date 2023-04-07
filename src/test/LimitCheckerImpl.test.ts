import { expect } from 'chai';
import MainLimitChecker from '../mainLimitChecker';
import { options } from '@bitr/logger';
options.enabled = false;

describe('MainLimitChecker', () => {
  it('MaxTargetVolumeLimit - violate', () => {
    const config = { maxTargetVolumePercent: 50 };
    const ps = {};
    const analysisResult = { availableVolume: 1.0, targetVolume: 0.7 };
    const checker = new MainLimitChecker({ config } as any, ps as any, analysisResult as any, analysisResult as any);
    checker["limits"] = checker["limits"].filter(limit => limit.constructor.name === 'MaxTargetVolumeLimit');
    const result = checker.check();
    expect(result.success).to.equal(false);
    expect(result.reason).to.equal('Too large Volume');
  });

  it('MaxTargetVolumeLimit - pass', () => {
    const config = { maxTargetVolumePercent: 50 };
    const ps = {};
    const analysisResult = { availableVolume: 1.0, targetVolume: 0.3 };
    const checker = new MainLimitChecker({ config } as any, ps as any, analysisResult as any, analysisResult as any);
    checker["limits"] = checker["limits"].filter(limit => limit.constructor.name === 'MaxTargetVolumeLimit');
    const result = checker.check();
    expect(result.success).to.equal(true);
    expect(result.reason).to.equal('');
  });

  it('MaxTargetVolumeLimit - undefined', () => {
    const config = { maxTargetVolumePercent: undefined };
    const ps = {};
    const analysisResult = { availableVolume: 1.0, targetVolume: 0.3 };
    const checker = new MainLimitChecker({ config } as any, ps as any, analysisResult as any, analysisResult as any);
    checker["limits"] = checker["limits"].filter(limit => limit.constructor.name === 'MaxTargetVolumeLimit');
    const result = checker.check();
    expect(result.success).to.equal(true);
    expect(result.reason).to.equal('');
  });
});
