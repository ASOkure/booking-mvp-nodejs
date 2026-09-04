// Converts a "wall clock" date+time in a named IANA timezone (e.g. the
// business's local time) into the correct UTC instant — accounting for DST,
// so a reminder scheduled for "24h before a June appointment" isn't off by
// an hour just because the UK is on BST then. Uses only the built-in Intl
// API; no date library dependency needed for this one conversion.
function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const targetMillis = Date.UTC(year, month - 1, day, hour, minute, 0);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });

  function asIfUtcMillis(date) {
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return Date.UTC(
      Number(map.year), Number(map.month) - 1, Number(map.day),
      Number(map.hour), Number(map.minute), Number(map.second)
    );
  }

  // Guess: treat the target wall-clock time as if it were already UTC, then
  // see what wall-clock time that UTC instant actually displays as in the
  // target zone, and correct by the difference.
  const guess = new Date(targetMillis);
  const shownAsMillis = asIfUtcMillis(guess);
  const diff = targetMillis - shownAsMillis;
  return new Date(guess.getTime() + diff);
}

module.exports = { zonedTimeToUtc };
