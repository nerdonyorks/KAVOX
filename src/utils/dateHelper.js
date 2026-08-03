/**
 * Kavox Universal Date & Time Helper (Server Side)
 * Formats all dates/times consistently to IST (Asia/Kolkata timezone)
 */

function formatDateTime(dateInput, options = {}) {
  if (!dateInput) return 'N/A';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Invalid Date';

  // Format parts in IST
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const parts = formatter.formatToParts(date);
  
  let day = '', month = '', year = '', hour = '', minute = '', dayPeriod = '';
  for (const part of parts) {
    if (part.type === 'day') day = part.value;
    else if (part.type === 'month') month = part.value; // e.g. "Aug"
    else if (part.type === 'year') year = part.value;
    else if (part.type === 'hour') hour = part.value;
    else if (part.type === 'minute') minute = part.value;
    else if (part.type === 'dayPeriod') dayPeriod = part.value.toUpperCase(); // e.g. "AM" or "PM"
  }

  if (day.length === 1) day = '0' + day;
  if (hour.length === 1) hour = '0' + hour;
  
  if (options.onlyDate) {
    return `${day} ${month} ${year}`;
  }
  if (options.onlyTime) {
    return `${hour}:${minute} ${dayPeriod}`;
  }

  const includeLabel = options.includeTimeZoneLabel !== false;
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}${includeLabel ? ' IST' : ''}`;
}

function formatDateOnly(dateInput) {
  return formatDateTime(dateInput, { onlyDate: true });
}

function formatTimeOnly(dateInput) {
  return formatDateTime(dateInput, { onlyTime: true, includeTimeZoneLabel: false });
}

module.exports = {
  formatDateTime,
  formatDateOnly,
  formatTimeOnly
};
