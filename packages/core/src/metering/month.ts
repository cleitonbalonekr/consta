const SAO_PAULO = "America/Sao_Paulo";

/**
 * A calendar month in São Paulo. Lawyers are in Brazil, so the monthly page quota
 * renews, and the operator's costs are totalled, from midnight there.
 */
export class Month {
  private static readonly FORM = /^(\d{4})-(\d{2})$/;

  private constructor(
    readonly year: number,
    /** 1 to 12. */
    readonly month: number,
  ) {}

  /** Null unless `text` is YYYY-MM with a month from 01 to 12. */
  static parse(text: string): Month | null {
    const match = Month.FORM.exec(text);
    if (!match) return null;
    const [year, month] = [Number(match[1]), Number(match[2])];
    return month >= 1 && month <= 12 ? new Month(year, month) : null;
  }

  /** The month a moment falls in, in São Paulo. */
  static of(moment: Date): Month {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO, year: "numeric", month: "numeric" }).formatToParts(moment);
    const part = (type: "year" | "month") => Number(parts.find((p) => p.type === type)!.value);
    return new Month(part("year"), part("month"));
  }

  /** Midnight of the first day, in São Paulo. */
  get start(): Date {
    const midnightAsUtc = Date.UTC(this.year, this.month - 1, 1);
    return new Date(midnightAsUtc - offsetMs(midnightAsUtc));
  }

  /** The start of the next month, which this one doesn't include. */
  get end(): Date {
    return this.next().start;
  }

  next(): Month {
    return this.month === 12 ? new Month(this.year + 1, 1) : new Month(this.year, this.month + 1);
  }

  previous(): Month {
    return this.month === 1 ? new Month(this.year - 1, 12) : new Month(this.year, this.month - 1);
  }

  /** YYYY-MM, the form `parse` reads. */
  toString(): string {
    return `${this.year}-${String(this.month).padStart(2, "0")}`;
  }
}

/** São Paulo's offset from UTC at a moment, e.g. -3 hours as -10_800_000. */
function offsetMs(moment: number) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO, timeZoneName: "longOffset" })
    .formatToParts(moment)
    .find((p) => p.type === "timeZoneName")!.value; // "GMT-03:00"
  const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(name)!;
  return (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
}
