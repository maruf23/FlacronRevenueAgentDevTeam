export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

export function isSameDayTimeRangeValid(start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return false;
  }
  return startMinutes < endMinutes;
}

export function isOvernightTimeRangeValid(start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return false;
  }
  return startMinutes !== endMinutes;
}
