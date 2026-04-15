(function (global) {
  "use strict";

  const BEARING_MODELS = {
    "6310": {
      n: 8,
      bd: 17.46,
      pd: 72.5,
      alpha: 0,
      defectFrequencies: { bpfo: 89.4, bpfi: 130.6, bsf: 57.8, ftf: 5.6 }
    },
    "6205": {
      n: 9,
      bd: 7.94,
      pd: 38.5,
      alpha: 0,
      defectFrequencies: { bpfo: 107.8, bpfi: 161.2, bsf: 70.1, ftf: 11.8 }
    },
    "6308": {
      n: 8,
      bd: 14.29,
      pd: 60,
      alpha: 0,
      defectFrequencies: { bpfo: 79.6, bpfi: 119.3, bsf: 52.4, ftf: 9.9 }
    }
  };

  const MACHINE_PROFILES = {
    progressive_cavity_pump: {
      ratedRPM: 300,
      lineFrequency: 50,
      bearingModel: "6310",
      defaultFault: "imbalance",
      baseTemp: 54,
      ranges: {
        "1x": [1.5, 2.5],
        "2x": [0.4, 0.8],
        "3x": [0.1, 0.4],
        subx: [0.05, 0.15],
        multix: [0.1, 0.3],
        "2lf": [0.1, 0.2],
        iso_rms: [1.5, 2.8]
      }
    },
    centrifugal_pump: {
      ratedRPM: 1450,
      lineFrequency: 50,
      bearingModel: "6205",
      defaultFault: "imbalance",
      baseTemp: 56,
      ranges: {
        "1x": [2.0, 3.5],
        "2x": [0.8, 1.5],
        "3x": [0.3, 0.6],
        subx: [0.1, 0.3],
        multix: [0.2, 0.5],
        "2lf": [0.1, 0.3],
        iso_rms: [2.0, 3.5]
      }
    },
    electric_motor: {
      ratedRPM: 1470,
      lineFrequency: 50,
      bearingModel: "6308",
      defaultFault: "electrical",
      baseTemp: 52,
      ranges: {
        "1x": [1.0, 2.0],
        "2x": [0.3, 0.6],
        "3x": [0.1, 0.3],
        subx: [0.05, 0.1],
        multix: [0.1, 0.2],
        "2lf": [0.2, 0.5],
        iso_rms: [1.0, 2.5]
      }
    },
    compressor: {
      ratedRPM: 980,
      lineFrequency: 50,
      bearingModel: "6310",
      defaultFault: "misalignment",
      baseTemp: 58,
      ranges: {
        "1x": [2.5, 4.0],
        "2x": [1.0, 2.0],
        "3x": [0.5, 1.0],
        subx: [0.1, 0.4],
        multix: [0.3, 0.8],
        "2lf": [0.1, 0.2],
        iso_rms: [2.5, 4.0]
      }
    }
  };

  const INDICATOR_THRESHOLDS = {
    "1x": [3.2, 4.5],
    "2x": [2.0, 3.0],
    "3x": [1.5, 2.2],
    subx: [1.0, 1.6],
    multix: [1.6, 2.6],
    "2lf": [0.9, 1.4],
    bpfo: [0.35, 0.6],
    bpfi: [0.35, 0.6],
    bsf: [0.25, 0.45],
    ftf: [0.45, 0.7],
    iso_rms: [2.8, 7.1],
    temperature: [60, 68]
  };

  const FAULT_TO_INDICATOR = {
    imbalance: "1x",
    misalignment: "2x",
    mechanical_looseness: "multix",
    bearing_outer_race: "bpfo",
    bearing_inner_race: "bpfi",
    electrical: "2lf",
    pump_cavitation: "iso_rms",
    universal_joint: "1x"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(value) {
    const input = String(value);
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function resolveSeed(seed, fallback) {
    if (seed == null) return hashSeed(fallback);
    return typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  }

  function resolveBearingModel(value) {
    if (!value) return null;
    if (typeof value === "string") return { model: value, ...BEARING_MODELS[value] };
    return { model: value.model || "custom", ...value };
  }

  function calculateBearingFrequencies(model, shaftFrequencyHz) {
    if (!model) return { bpfo: 0, bpfi: 0, bsf: 0, ftf: 0 };
    if (model.defectFrequencies) return { ...model.defectFrequencies };
    const ratio = model.bd / model.pd;
    const angle = (model.alpha * Math.PI) / 180;
    const cosA = Math.cos(angle);
    return {
      bpfo: round((model.n / 2) * shaftFrequencyHz * (1 - ratio * cosA), 1),
      bpfi: round((model.n / 2) * shaftFrequencyHz * (1 + ratio * cosA), 1),
      bsf: round((model.pd / (2 * model.bd)) * shaftFrequencyHz * (1 - (ratio * cosA) ** 2), 1),
      ftf: round((shaftFrequencyHz / 2) * (1 - ratio * cosA), 1)
    };
  }

  function createFrequencyAxis(range, resolution) {
    const axis = new Float64Array(resolution);
    const step = (range[1] - range[0]) / (resolution - 1);
    for (let index = 0; index < resolution; index += 1) {
      axis[index] = range[0] + step * index;
    }
    return axis;
  }

  function describeFault(faultType) {
    return String(faultType || "fault")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function zoneFromIso(isoRms) {
    if (isoRms <= 1.4) return "A";
    if (isoRms <= 2.8) return "B";
    if (isoRms <= 7.1) return "C";
    return "D";
  }

  function addGaussianPeak(amplitudes, frequencyBins, center, amplitude, rng, widthScale) {
    if (!center || amplitude <= 0) return;
    const jitteredCenter = center + (rng() - 0.5) * 0.16;
    const jitteredAmplitude = amplitude * (0.95 + rng() * 0.1);
    const width = (center * 0.01 + 0.75) * (widthScale || 1);
    const lower = jitteredCenter - width * 4;
    const upper = jitteredCenter + width * 4;
    for (let index = 0; index < frequencyBins.length; index += 1) {
      const freq = frequencyBins[index];
      if (freq < lower || freq > upper) continue;
      amplitudes[index] += jitteredAmplitude * Math.exp(-0.5 * ((freq - jitteredCenter) / width) ** 2);
    }
  }

  function bandMax(amplitudes, frequencyBins, minFreq, maxFreq) {
    let max = 0;
    for (let index = 0; index < frequencyBins.length; index += 1) {
      const freq = frequencyBins[index];
      if (freq >= minFreq && freq <= maxFreq && amplitudes[index] > max) {
        max = amplitudes[index];
      }
    }
    return max;
  }

  function indicatorBand(center, halfWidth, frequencyBins) {
    const step = frequencyBins.length > 1 ? frequencyBins[1] - frequencyBins[0] : 1;
    const effectiveHalfWidth = Math.max(halfWidth, step * 1.1);
    return [center - effectiveHalfWidth, center + effectiveHalfWidth];
  }

  function timeProgress(pattern, progressFraction, rng) {
    const t = clamp(progressFraction, 0, 1);
    if (pattern === "normal") return 0;
    if (pattern === "critical") return 1.75;
    if (pattern === "abnormal") {
      const spike = rng() > 0.88 ? 0.25 + rng() * 0.35 : 0;
      return 1.05 + spike;
    }
    if (t < 0.3) return 0;
    if (t < 0.7) {
      const phase = (t - 0.3) / 0.4;
      return 0.58 * phase ** 2;
    }
    const late = (t - 0.7) / 0.3;
    return 0.58 + 0.52 * late ** 3;
  }

  function normalIndicatorSet(profile, rng) {
    const ranges = profile.ranges;
    return {
      "1x": lerp(ranges["1x"][0], ranges["1x"][1], rng()),
      "2x": lerp(ranges["2x"][0], ranges["2x"][1], rng()),
      "3x": lerp(ranges["3x"][0], ranges["3x"][1], rng()),
      subx: lerp(ranges.subx[0], ranges.subx[1], rng()),
      multix: lerp(ranges.multix[0], ranges.multix[1], rng()),
      "2lf": lerp(ranges["2lf"][0], ranges["2lf"][1], rng()),
      bpfo: 0.02 + rng() * 0.05,
      bpfi: 0.02 + rng() * 0.05,
      bsf: 0.015 + rng() * 0.03,
      ftf: 0.02 + rng() * 0.04
    };
  }

  function applyFaultModel(state) {
    const {
      peaks,
      faultType,
      pattern,
      progress,
      rng
    } = state;
    const severity = pattern === "critical" ? 1.9 : pattern === "abnormal" ? 1.15 : progress;
    const criticalBoost = pattern === "critical" ? 1.45 : 1;

    if (faultType === "imbalance") {
      peaks["1x"] = lerp(peaks["1x"], 4.2 + rng() * 1.7, severity) * criticalBoost;
      peaks["2x"] = lerp(peaks["2x"], peaks["1x"] * (0.18 + rng() * 0.08), severity * 0.45);
      peaks["3x"] = lerp(peaks["3x"], peaks["1x"] * 0.08, severity * 0.25);
      return;
    }

    if (faultType === "misalignment") {
      peaks["2x"] = lerp(peaks["2x"], 2.2 + rng() * 1.7, severity) * criticalBoost;
      peaks["1x"] = lerp(peaks["1x"], peaks["2x"] * (0.62 + rng() * 0.12), severity * 0.75);
      peaks["3x"] = lerp(peaks["3x"], 0.8 + rng() * 0.8, severity * 0.7);
      return;
    }

    if (faultType === "mechanical_looseness") {
      peaks.multix = lerp(peaks.multix, 2.0 + rng() * 1.6, severity) * criticalBoost;
      peaks.subx = lerp(peaks.subx, 0.45 + rng() * 0.55, severity);
      peaks["1x"] = lerp(peaks["1x"], 2.6 + rng() * 1.4, severity * 0.8);
      peaks["2x"] = lerp(peaks["2x"], 1.6 + rng() * 1.2, severity * 0.8);
      peaks["3x"] = lerp(peaks["3x"], 1.2 + rng() * 0.8, severity * 0.8);
      return;
    }

    if (faultType === "bearing_outer_race") {
      peaks.bpfo = lerp(peaks.bpfo, 0.75 + rng() * 1.15, severity) * criticalBoost;
      peaks.bpfi *= 0.7;
      peaks.bsf = lerp(peaks.bsf, 0.18 + rng() * 0.24, severity * 0.35);
      return;
    }

    if (faultType === "bearing_inner_race") {
      peaks.bpfi = lerp(peaks.bpfi, 0.95 + rng() * 1.35, severity) * criticalBoost;
      peaks.bpfo *= 0.75;
      peaks.bsf = lerp(peaks.bsf, 0.22 + rng() * 0.24, severity * 0.4);
      return;
    }

    if (faultType === "electrical") {
      peaks["2lf"] = lerp(peaks["2lf"], 1.6 + rng() * 1.2, severity) * criticalBoost;
      peaks["1x"] *= 0.95;
      return;
    }

    if (faultType === "pump_cavitation") {
      peaks["1x"] *= 0.92;
      peaks["2x"] *= 0.9;
      peaks["3x"] *= 0.9;
      peaks.multix = lerp(peaks.multix, 0.6 + rng() * 0.6, severity * 0.5);
      return;
    }

    if (faultType === "universal_joint") {
      peaks["1x"] = lerp(peaks["1x"], 3.0 + rng() * 1.5, severity) * criticalBoost;
      peaks["2x"] = lerp(peaks["2x"], 1.25 + rng() * 0.7, severity * 0.85);
      peaks["3x"] = lerp(peaks["3x"], 0.9 + rng() * 0.6, severity * 0.8);
      peaks.multix = lerp(peaks.multix, 1.25 + rng() * 0.9, severity * 0.9);
    }
  }

  function buildAiNote(payload) {
    const {
      aiFlag,
      primaryIndicator,
      indicators,
      faultType,
      history
    } = payload;
    const label = primaryIndicator.toUpperCase();
    const current = indicators[primaryIndicator];
    const prior = history.length ? history[Math.max(0, history.length - 3)][primaryIndicator] : current;
    const changePct = prior > 0 ? ((current - prior) / prior) * 100 : 0;
    const hours = Math.max(6, history.length * 0.25 * 24);
    const threshold = INDICATOR_THRESHOLDS[primaryIndicator] || INDICATOR_THRESHOLDS.iso_rms;

    if (aiFlag == null) {
      return "All indicators nominal - no action required.";
    }
    if (aiFlag === "watch") {
      return label + " velocity trending upward (+" + Math.max(6, round(changePct, 0)) + "% over " + round(hours, 0) + "h) - monitoring for " + describeFault(faultType).toLowerCase() + " development.";
    }
    if (aiFlag === "warning") {
      return label + " velocity " + round(current, 2) + " mm/s exceeds alert threshold (" + threshold[0] + " mm/s) - recommend vibration survey within 72h.";
    }
    return "ISO 10816 Zone " + payload.isoZone + " - immediate shutdown recommended. " + label + " elevated at " + round(current, 2) + " mm/s, bearing temperature " + round(indicators.temperature, 1) + "C rising. Probable " + describeFault(faultType).toLowerCase() + ".";
  }

  function generateLogSeverity(aiFlag) {
    if (aiFlag === "critical") return "critical";
    if (aiFlag === "warning" || aiFlag === "watch") return "warning";
    return "info";
  }

  function create(config) {
    const preset = MACHINE_PROFILES[config && config.machineProfile ? config.machineProfile : "progressive_cavity_pump"] || MACHINE_PROFILES.progressive_cavity_pump;
    const profile = {
      machineProfile: config && config.machineProfile ? config.machineProfile : "progressive_cavity_pump",
      ratedRPM: config && config.ratedRPM != null ? config.ratedRPM : preset.ratedRPM,
      lineFrequency: config && config.lineFrequency != null ? config.lineFrequency : preset.lineFrequency,
      bearingModel: config && config.bearingModel != null ? config.bearingModel : preset.bearingModel,
      frequencyRange: config && config.frequencyRange ? config.frequencyRange : [0, 1000],
      resolution: config && config.resolution ? config.resolution : 512,
      defaultFault: preset.defaultFault,
      baseTemp: preset.baseTemp,
      ranges: preset.ranges
    };

    const shaftFrequencyHz = profile.ratedRPM / 60;
    const bearingModel = resolveBearingModel(profile.bearingModel);
    const bearingFrequencies = calculateBearingFrequencies(bearingModel, shaftFrequencyHz);
    const frequencyAxis = createFrequencyAxis(profile.frequencyRange, profile.resolution);

    function buildSpectrum(options, sharedHistory) {
      const pattern = options.pattern || "normal";
      const faultType = options.faultType || profile.defaultFault;
      const progressFraction = clamp(options.progressFraction == null ? 1 : options.progressFraction, 0, 1);
      const rng = options.rng;
      const history = sharedHistory || [];
      const progress = timeProgress(pattern, progressFraction, rng);
      const peaks = normalIndicatorSet(profile, rng);
      const amplitudes = new Float64Array(profile.resolution);
      const highFreqNoiseBoost = faultType === "pump_cavitation" ? 0.8 + progress * 1.8 : 0;
      const broadbandGrowth = pattern === "critical" ? 1.8 : pattern === "abnormal" ? 0.45 : progressFraction > 0.7 ? (progressFraction - 0.7) / 0.3 * 0.2 : 0;
      const noiseFloor = pattern === "critical" ? 0.13 : pattern === "abnormal" ? 0.085 : 0.05;
      const noiseVariation = pattern === "critical" ? 0.08 : pattern === "abnormal" ? 0.045 : 0.025;

      applyFaultModel({ peaks, faultType, pattern, progress, rng });

      for (let index = 0; index < frequencyAxis.length; index += 1) {
        const freq = frequencyAxis[index];
        const lowFreqLift = 1 + 0.3 * Math.exp(-freq / 3);
        const highFreqLift = 1 + 0.1 * Math.exp((freq - profile.frequencyRange[1] * 0.9) / (profile.frequencyRange[1] * 0.2));
        const broadband = 1 + ((freq >= 100 && freq <= 500) ? broadbandGrowth : 0);
        const cavitation = freq >= 200 ? 1 + highFreqNoiseBoost * (0.4 + 0.6 * Math.sin(freq / 110) ** 2) : 1;
        amplitudes[index] = noiseFloor * lowFreqLift * highFreqLift * broadband * cavitation + rng() * noiseVariation;
      }

      addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz, peaks["1x"], rng);
      addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz * 2, peaks["2x"], rng);
      addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz * 3, peaks["3x"], rng);
      addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz * 0.5, peaks.subx, rng, 1.15);
      addGaussianPeak(amplitudes, frequencyAxis, profile.lineFrequency * 2, peaks["2lf"], rng);
      addGaussianPeak(amplitudes, frequencyAxis, bearingFrequencies.bpfo, peaks.bpfo, rng);
      addGaussianPeak(amplitudes, frequencyAxis, bearingFrequencies.bpfi, peaks.bpfi, rng);
      addGaussianPeak(amplitudes, frequencyAxis, bearingFrequencies.bsf, peaks.bsf, rng);
      addGaussianPeak(amplitudes, frequencyAxis, bearingFrequencies.ftf, peaks.ftf, rng);

      if (faultType === "mechanical_looseness" || faultType === "universal_joint" || pattern === "critical") {
        for (let harmonic = 4; harmonic <= 8; harmonic += 1) {
          const decay = faultType === "mechanical_looseness" ? 0.72 : faultType === "universal_joint" ? 0.78 : 0.82;
          const harmonicAmp = peaks.multix * decay ** (harmonic - 4);
          addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz * harmonic, harmonicAmp, rng);
        }
        addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz * 1.5, peaks.subx * 0.9, rng, 1.1);
      }

      if (faultType === "bearing_outer_race" || faultType === "bearing_inner_race" || pattern === "critical") {
        const mainFreq = faultType === "bearing_inner_race" ? bearingFrequencies.bpfi : bearingFrequencies.bpfo;
        const mainAmp = faultType === "bearing_inner_race" ? peaks.bpfi : peaks.bpfo;
        const sidebandRatio = faultType === "bearing_inner_race" ? 0.52 : 0.38;
        for (let sideband = 1; sideband <= 2; sideband += 1) {
          addGaussianPeak(amplitudes, frequencyAxis, mainFreq - shaftFrequencyHz * sideband, mainAmp * sidebandRatio / sideband, rng, 1.05);
          addGaussianPeak(amplitudes, frequencyAxis, mainFreq + shaftFrequencyHz * sideband, mainAmp * sidebandRatio / sideband, rng, 1.05);
        }
        addGaussianPeak(amplitudes, frequencyAxis, mainFreq * 2, mainAmp * 0.28, rng, 1.15);
      }

      if (faultType === "electrical" || pattern === "critical") {
        addGaussianPeak(amplitudes, frequencyAxis, profile.lineFrequency * 2 - 2, peaks["2lf"] * 0.36, rng, 0.9);
        addGaussianPeak(amplitudes, frequencyAxis, profile.lineFrequency * 2 + 2, peaks["2lf"] * 0.36, rng, 0.9);
      }

      if (faultType === "pump_cavitation") {
        for (let center = 240; center <= 760; center += 110) {
          addGaussianPeak(amplitudes, frequencyAxis, center, 0.14 + progress * 0.25 + rng() * 0.1, rng, 10);
        }
      }

      if (pattern === "critical") {
        addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz * 0.33, 0.35 + rng() * 0.2, rng, 1.2);
        addGaussianPeak(amplitudes, frequencyAxis, shaftFrequencyHz * 0.5, 0.45 + rng() * 0.22, rng, 1.2);
      }

      let sumSquares = 0;
      for (let index = 0; index < amplitudes.length; index += 1) {
        amplitudes[index] = Math.max(0, amplitudes[index]);
        sumSquares += amplitudes[index] ** 2;
      }

      const indicators = {
        "1x": round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(shaftFrequencyHz, 0.5, frequencyAxis)), 2),
        "2x": round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(shaftFrequencyHz * 2, 0.5, frequencyAxis)), 2),
        "3x": round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(shaftFrequencyHz * 3, 0.5, frequencyAxis)), 2),
        subx: round(bandMax(amplitudes, frequencyAxis, shaftFrequencyHz * 0.3, shaftFrequencyHz * 0.7), 2),
        multix: round(
          [4, 5, 6, 7, 8]
            .map((harmonic) => bandMax(amplitudes, frequencyAxis, ...indicatorBand(shaftFrequencyHz * harmonic, 0.6, frequencyAxis)))
            .reduce((sum, value) => sum + value, 0),
          2
        ),
        "2lf": round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(profile.lineFrequency * 2, 1, frequencyAxis)), 2),
        iso_rms: round(Math.sqrt(sumSquares) * 0.9, 2),
        bpfo: round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(bearingFrequencies.bpfo, 1, frequencyAxis)), 2),
        bpfi: round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(bearingFrequencies.bpfi, 1, frequencyAxis)), 2),
        bsf: round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(bearingFrequencies.bsf, 1, frequencyAxis)), 2),
        ftf: round(bandMax(amplitudes, frequencyAxis, ...indicatorBand(bearingFrequencies.ftf, 0.5, frequencyAxis)), 2),
        temperature: 0
      };

      const recentIso = history.slice(-3).map((entry) => entry.iso_rms);
      const laggedIso = average(recentIso.length ? recentIso : [indicators.iso_rms]);
      const normalIso = average(profile.ranges.iso_rms);
      let temperature = profile.baseTemp + Math.max(0, laggedIso / normalIso - 1) * 11 + (rng() - 0.5);
      if (pattern === "degrading") temperature += progressFraction * 4.5;
      if (pattern === "abnormal") temperature = Math.max(temperature, 62 + rng() * 5);
      if (pattern === "critical") temperature = Math.max(temperature, 70 + progressFraction * 8 + rng() * 4);
      indicators.temperature = round(clamp(temperature, 50, pattern === "critical" ? 85 : 72), 1);

      const isoZone = zoneFromIso(indicators.iso_rms);
      const primaryIndicator = FAULT_TO_INDICATOR[faultType] || "1x";
      let aiFlag = null;
      if (pattern === "critical" || isoZone === "D") aiFlag = "critical";
      else if (pattern === "abnormal") aiFlag = indicators.iso_rms > 6.5 ? "critical" : "warning";
      else if (pattern === "degrading") {
        if (progressFraction >= 0.85 || indicators.iso_rms >= INDICATOR_THRESHOLDS.iso_rms[1]) aiFlag = "critical";
        else if (progressFraction >= 0.6 || indicators[primaryIndicator] >= (INDICATOR_THRESHOLDS[primaryIndicator] || [Infinity])[0]) aiFlag = "warning";
        else if (progressFraction >= 0.4) aiFlag = "watch";
      }

      const snapshot = {
        timestamp: options.timestamp instanceof Date ? new Date(options.timestamp) : new Date(options.timestamp),
        frequencyBins: new Float64Array(frequencyAxis),
        amplitudes,
        indicators,
        iso10816Zone: isoZone,
        aiFlag,
        aiNote: ""
      };
      snapshot.aiNote = buildAiNote({
        aiFlag,
        primaryIndicator,
        indicators,
        faultType,
        history,
        isoZone
      });

      return snapshot;
    }

    function generateSpectraRange(options) {
      const startTime = options.startTime instanceof Date ? new Date(options.startTime) : new Date(options.startTime);
      const endTime = options.endTime instanceof Date ? new Date(options.endTime) : new Date(options.endTime);
      const intervalMs = Math.max(1, Number(options.interval || 900)) * 1000;
      const stepCount = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / intervalMs) + 1);
      const seed = resolveSeed(options.seed, startTime.toISOString() + "|" + endTime.toISOString());
      const rng = mulberry32(seed);
      const faultType = options.faultType || profile.defaultFault;
      const spectra = [];
      const history = [];

      for (let index = 0; index < stepCount; index += 1) {
        const timestamp = new Date(startTime.getTime() + intervalMs * index);
        const progressFraction = stepCount === 1 ? 1 : index / (stepCount - 1);
        const spectrum = buildSpectrum({
          timestamp,
          pattern: options.pattern || "normal",
          faultType,
          progressFraction,
          rng
        }, history);
        history.push({
          "1x": spectrum.indicators["1x"],
          "2x": spectrum.indicators["2x"],
          "3x": spectrum.indicators["3x"],
          subx: spectrum.indicators.subx,
          multix: spectrum.indicators.multix,
          "2lf": spectrum.indicators["2lf"],
          bpfo: spectrum.indicators.bpfo,
          bpfi: spectrum.indicators.bpfi,
          bsf: spectrum.indicators.bsf,
          ftf: spectrum.indicators.ftf,
          iso_rms: spectrum.indicators.iso_rms
        });
        spectra.push(spectrum);
      }

      const finalSpectrum = spectra[spectra.length - 1];
      const primaryIndicator = FAULT_TO_INDICATOR[faultType] || "1x";
      return {
        metadata: {
          machineProfile: profile.machineProfile,
          ratedRPM: profile.ratedRPM,
          shaftFrequencyHz: round(shaftFrequencyHz, 2),
          lineFrequency: profile.lineFrequency,
          bearingModel: bearingModel ? bearingModel.model : null,
          bearingFrequencies: { ...bearingFrequencies },
          frequencyRange: [...profile.frequencyRange],
          resolution: profile.resolution,
          generatedAt: new Date().toISOString()
        },
        spectra,
        summary: {
          totalSpectra: spectra.length,
          patternApplied: options.pattern || "normal",
          faultTypeApplied: faultType,
          peakIndicator: primaryIndicator,
          peakValue: finalSpectrum ? finalSpectrum.indicators[primaryIndicator] : 0,
          isoZoneProgression: spectra.map((spectrum) => spectrum.iso10816Zone)
        }
      };
    }

    function generateSingleSpectrum(options) {
      const timestamp = options.timestamp instanceof Date ? new Date(options.timestamp) : new Date(options.timestamp || Date.now());
      const seed = resolveSeed(options.seed, timestamp.toISOString());
      return buildSpectrum({
        timestamp,
        pattern: options.pattern || "normal",
        faultType: options.faultType || profile.defaultFault,
        progressFraction: options.progressFraction == null ? 1 : options.progressFraction,
        rng: mulberry32(seed)
      }, []);
    }

    return {
      generateSpectraRange,
      generateSingleSpectrum,
      getFrequencyAxis() {
        return new Float64Array(frequencyAxis);
      },
      getBearingFrequencies() {
        return { ...bearingFrequencies };
      },
      getIndicatorThresholds() {
        return JSON.parse(JSON.stringify(INDICATOR_THRESHOLDS));
      },
      buildLogSeverity: generateLogSeverity
    };
  }

  global.SpectrumGenerator = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
