import { describe, it, expect } from "vitest";
import {
  diffStructures,
  structureHash,
  type FrozenStructure,
} from "../src/console/instruments.service";

// A published version is frozen and an inspection binds to the version in force
// when it began. The structure hash is what makes "frozen" checkable: it is
// stamped into the inspection, so a later claim that the instrument was
// different can be tested rather than argued.

function base(): FrozenStructure {
  return {
    versionLabel: "v3.1",
    satisfactoryMin: 80,
    needsImprovementMin: 60,
    sections: [
      {
        ordinal: 1,
        titleEn: "Premises and storage",
        titleHa: "Wurin ajiya",
        checkpoints: [
          {
            ordinal: 1,
            promptEn: "Is the store roof free of leaks?",
            promptHa: "Rufin rumbun ba ya yoyo?",
            weight: 1,
            severityOnFail: "major",
            allowsNa: false,
          },
          {
            ordinal: 2,
            promptEn: "Are bags stacked clear of the walls?",
            promptHa: "An tara buhuna nesa da bango?",
            weight: 1,
            severityOnFail: "minor",
            allowsNa: false,
          },
        ],
      },
    ],
  };
}

describe("structureHash", () => {
  it("is deterministic for the same structure", () => {
    expect(structureHash(base())).toBe(structureHash(base()));
  });

  it("changes when any part of the structure changes", () => {
    const before = structureHash(base());

    const reworded = base();
    reworded.sections[0]!.checkpoints[0]!.promptEn = "Is the roof sound?";
    expect(structureHash(reworded)).not.toBe(before);

    const reweighted = base();
    reweighted.sections[0]!.checkpoints[0]!.weight = 3;
    expect(structureHash(reweighted)).not.toBe(before);

    const rebanded = base();
    rebanded.satisfactoryMin = 85;
    expect(structureHash(rebanded)).not.toBe(before);

    const translated = base();
    translated.sections[0]!.checkpoints[0]!.promptHa = "Rufin yana da kyau?";
    expect(structureHash(translated)).not.toBe(before);
  });
});

describe("diffStructures (the explicit change list shown before publish)", () => {
  it("reports nothing when nothing moved", () => {
    expect(diffStructures(base(), base())).toEqual([]);
  });

  it("names an added checkpoint", () => {
    const next = base();
    next.sections[0]!.checkpoints.push({
      ordinal: 3,
      promptEn: "Is a fire extinguisher present and in date?",
      promptHa: "Akwai na kashe gobara mai aiki?",
      weight: 2,
      severityOnFail: "critical",
      allowsNa: false,
    });
    const changes = diffStructures(base(), next);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "added", ref: "1.3" });
    expect(changes[0]!.detail).toContain("fire extinguisher");
  });

  it("names a removed checkpoint", () => {
    const next = base();
    next.sections[0]!.checkpoints.pop();
    const changes = diffStructures(base(), next);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "removed", ref: "1.2" });
  });

  it("names a rewording, a reweighting, and a severity change separately", () => {
    const next = base();
    next.sections[0]!.checkpoints[0]!.promptEn = "Is the store roof watertight?";
    next.sections[0]!.checkpoints[0]!.weight = 2;
    next.sections[0]!.checkpoints[0]!.severityOnFail = "critical";

    const kinds = diffStructures(base(), next).map((c) => c.kind);
    expect(kinds).toContain("reworded");
    expect(kinds).toContain("reweighted");
    expect(kinds).toContain("severity_changed");
  });

  it("names a change to the rating bands, which changes what a rating means", () => {
    const next = base();
    next.satisfactoryMin = 85;
    const changes = diffStructures(base(), next);
    expect(changes[0]).toMatchObject({ kind: "bands_changed" });
    expect(changes[0]!.detail).toContain("85");
  });
});
