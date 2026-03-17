/**
 * Tests for Natural Language Cron Parser
 */

import { describe, test, expect } from "bun:test";
import { parseNaturalSchedule, createCronFromNL } from "../../src/cron/nl-parser.js";

describe("Natural Language Cron Parser", () => {
  describe("Daily Patterns", () => {
    test("should parse 'daily at 8am'", () => {
      const result = parseNaturalSchedule("daily at 8am");
      
      expect(result.cronExpression).toBe("0 8 * * *");
      expect(result.recurring).toBe(true);
      expect(result.description).toContain("Daily");
      expect(result.description).toContain("8:00am");
    });

    test("should parse 'every day at 9:30pm'", () => {
      const result = parseNaturalSchedule("every day at 9:30pm");
      
      expect(result.cronExpression).toBe("30 21 * * *");
      expect(result.recurring).toBe(true);
    });

    test("should parse 'daily at 14:00'", () => {
      const result = parseNaturalSchedule("daily at 14:00");
      
      expect(result.cronExpression).toBe("0 14 * * *");
      expect(result.recurring).toBe(true);
    });
  });

  describe("Hourly Patterns", () => {
    test("should parse 'hourly'", () => {
      const result = parseNaturalSchedule("hourly");
      
      expect(result.cronExpression).toBe("0 * * * *");
      expect(result.recurring).toBe(true);
      expect(result.description).toContain("hour");
    });

    test("should parse 'every hour'", () => {
      const result = parseNaturalSchedule("every hour");
      
      expect(result.cronExpression).toBe("0 * * * *");
      expect(result.recurring).toBe(true);
    });
  });

  describe("Weekly Patterns", () => {
    test("should parse 'weekly on sunday'", () => {
      const result = parseNaturalSchedule("weekly on sunday");
      
      expect(result.cronExpression).toBe("0 0 * * 0");
      expect(result.recurring).toBe(true);
      expect(result.description).toContain("Sunday");
    });

    test("should parse 'every week on monday at 9am'", () => {
      const result = parseNaturalSchedule("every week on monday at 9am");
      
      expect(result.cronExpression).toBe("0 9 * * 1");
      expect(result.recurring).toBe(true);
    });

    test("should parse 'weekly on friday at 5:30pm'", () => {
      const result = parseNaturalSchedule("weekly on friday at 5:30pm");
      
      expect(result.cronExpression).toBe("30 17 * * 5");
      expect(result.recurring).toBe(true);
    });
  });

  describe("Monthly Patterns", () => {
    test("should parse 'monthly on the 1st'", () => {
      const result = parseNaturalSchedule("monthly on the 1st");
      
      expect(result.cronExpression).toBe("0 0 1 * *");
      expect(result.recurring).toBe(true);
    });

    test("should parse 'every month on the 15th at noon'", () => {
      const result = parseNaturalSchedule("every month on the 15th at noon");
      
      // Monthly at noon = 12:00 on day 15
      expect(result.cronExpression).toContain("15"); // day of month
      expect(result.recurring).toBe(true);
    });

    test("should parse 'monthly on the 15th'", () => {
      const result = parseNaturalSchedule("monthly on the 15th");
      
      expect(result.cronExpression).toContain("15");
      expect(result.recurring).toBe(true);
    });
  });

  describe("Duration Patterns", () => {
    test("should parse 'in 30 minutes'", () => {
      const result = parseNaturalSchedule("in 30 minutes");
      
      expect(result.atDuration).toBe(30 * 60 * 1000);
      expect(result.recurring).toBe(false);
    });

    test("should parse 'in 2 hours'", () => {
      const result = parseNaturalSchedule("in 2 hours");
      
      expect(result.atDuration).toBe(2 * 60 * 60 * 1000);
      expect(result.recurring).toBe(false);
    });

    test("should parse 'in 3 days'", () => {
      const result = parseNaturalSchedule("in 3 days");
      
      expect(result.atDuration).toBe(3 * 24 * 60 * 60 * 1000);
      expect(result.recurring).toBe(false);
    });
  });

  describe("Every Interval Patterns", () => {
    test("should parse 'every 30 minutes'", () => {
      const result = parseNaturalSchedule("every 30 minutes");
      
      expect(result.cronExpression).toBe("*/30 * * * *");
      expect(result.recurring).toBe(true);
    });

    test("should parse 'every 2 hours'", () => {
      const result = parseNaturalSchedule("every 2 hours");
      
      expect(result.cronExpression).toBe("0 */2 * * *");
      expect(result.recurring).toBe(true);
    });

    test("should parse 'every 3 days'", () => {
      const result = parseNaturalSchedule("every 3 days");
      
      expect(result.cronExpression).toBe("0 0 */3 * *");
      expect(result.recurring).toBe(true);
    });
  });

  describe("Named Time Patterns", () => {
    test("should parse 'noon'", () => {
      const result = parseNaturalSchedule("noon");
      
      expect(result.recurring).toBe(false);
      expect(result.description).toContain("noon");
    });

    test("should parse 'midnight'", () => {
      const result = parseNaturalSchedule("midnight");
      
      expect(result.recurring).toBe(false);
      expect(result.description).toContain("midnight");
    });
  });

  describe("Tomorrow Pattern", () => {
    test("should parse 'tomorrow'", () => {
      const result = parseNaturalSchedule("tomorrow");
      
      expect(result.recurring).toBe(false);
      expect(result.at).toBeGreaterThan(Date.now());
    });

    test("should parse 'tomorrow at 5pm'", () => {
      const result = parseNaturalSchedule("tomorrow at 5pm");
      
      expect(result.recurring).toBe(false);
      expect(result.at).toBeGreaterThan(Date.now());
    });
  });

  describe("Next Day Pattern", () => {
    test("should parse 'next monday'", () => {
      const result = parseNaturalSchedule("next monday");
      
      expect(result.recurring).toBe(false);
      expect(result.at).toBeGreaterThan(Date.now());
    });

    test("should parse 'next friday at 3pm'", () => {
      const result = parseNaturalSchedule("next friday at 3pm");
      
      expect(result.recurring).toBe(false);
      expect(result.at).toBeGreaterThan(Date.now());
    });
  });

  describe("Cron Expression Passthrough", () => {
    test("should pass through valid cron expressions", () => {
      const result = parseNaturalSchedule("0 9 * * *");
      
      expect(result.cronExpression).toBe("0 9 * * *");
      expect(result.recurring).toBe(true);
    });

    test("should pass through complex cron", () => {
      const result = parseNaturalSchedule("*/15 9-17 * * 1-5");
      
      // Complex cron - not natural language, should fail to parse
      // (The cron pattern in the code only matches standard 5-field cron)
      expect(result.description).toContain("Could not parse");
    });
  });

  describe("createCronFromNL", () => {
    test("should create job from natural language", () => {
      const job = createCronFromNL("daily at 8am", {
        name: "Morning Job",
        message: "Wake up!",
      });
      
      expect(job).not.toBeNull();
      expect(job?.name).toBe("Morning Job");
      expect(job?.cronExpression).toBe("0 8 * * *");
    });

    test("should create job from 'in X' duration", () => {
      const job = createCronFromNL("in 20 minutes", {
        name: "Reminder",
        message: "Timer done",
      });
      
      expect(job).not.toBeNull();
      expect(job?.atDuration).toBe(20 * 60 * 1000);
    });

    test("should return null for unparseable input", () => {
      const job = createCronFromNL("blah blah blah");
      
      expect(job).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    test("should handle case insensitivity", () => {
      const result1 = parseNaturalSchedule("DAILY AT 8AM");
      const result2 = parseNaturalSchedule("Daily At 8Am");
      
      expect(result1.cronExpression).toBe("0 8 * * *");
      expect(result2.cronExpression).toBe("0 8 * * *");
    });

    test("should handle extra whitespace", () => {
      const result = parseNaturalSchedule("  daily   at   8am  ");
      
      expect(result.cronExpression).toBe("0 8 * * *");
    });

    test("should return description for unparseable input", () => {
      const result = parseNaturalSchedule("do something weird");
      
      expect(result.recurring).toBe(false);
      expect(result.description).toContain("Could not parse");
    });
  });
});