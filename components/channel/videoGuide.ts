/**
 * OTA XML → Video guide: one short captioned video per chapter, recorded from the real system
 * (scripts/ota-guide/record.cjs), plus what each page is and what it is used for.
 * The videos live in public/guide/ota/<id>.mp4 with a poster frame <id>.jpg.
 */
export interface GuidePage {
  name: string;
  /** Where to find it in OTA XML. */
  where: string;
  what: string;
  usedFor: string;
}

export interface GuideChapter {
  id: string;
  title: string;
  summary: string;
  /** Length of the video, as shown on the list (m:ss). */
  length: string;
  pages: GuidePage[];
}

export const GUIDE_VIDEO = (id: string) => `/guide/ota/${id}.mp4`;
export const GUIDE_POSTER = (id: string) => `/guide/ota/${id}.jpg`;

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: '01-overview', title: 'The Channel Manager', length: '1:09',
    summary: 'Where you connect car-rental brokers, publish your prices to them and receive their bookings.',
    pages: [
      { name: 'Channel Manager', where: 'OTA XML', what: 'The home of everything to do with brokers (websites such as Rentalcars or DiscoverCars that sell your cars).',
        usedFor: 'Seeing at a glance whether every broker connection is healthy, and opening any broker or console page.' },
      { name: 'Status bar', where: 'Top of OTA XML', what: 'Broker updates, live channels, unpublished changes, blocking errors, stop sales today and the last publish.',
        usedFor: 'Noticing straight away when something needs you, for example a failed update to a broker.' },
      { name: 'Channels', where: 'OTA XML → Channels', what: 'The list of brokers. Each broker is a channel with its own prices, rules and key.',
        usedFor: 'Opening a broker to set it up or check its bookings and traffic. “Add channel” connects a new broker (it starts in Testing).' },
    ],
  },
  {
    id: '02-new-broker', title: 'Connecting a new broker, step by step', length: '2:25',
    summary: 'From “Add channel” to a broker that is ready to go live, done live in the system.',
    pages: [
      { name: '1 · Add the channel', where: 'OTA XML → Add channel', what: 'Name, channel code and “Copy setup from” an existing broker (branches, booking rules, extras, terms and rates; never keys or contacts).',
        usedFor: 'Starting a new broker in a minute. It starts in Testing: its bookings are sandbox bookings and never hold a car.' },
      { name: '2 · Check the setup steps', where: 'Channel → Overview', what: 'Every setup step in order, with a link to the page where it is done.',
        usedFor: 'Knowing exactly what is still missing before the broker can connect.' },
      { name: '3 · Review and publish the rates', where: 'Channel → Rates → Review & publish', what: 'The publish window shows what changes; publishing sends the prices to the broker as a new version.',
        usedFor: 'Making the prices live for this broker.' },
      { name: '4 · Choose the XML layout', where: 'Channel → Connection', what: '“OpenTravel standard” for new brokers, checked against the official OpenTravel rules; the broker’s contacts and OpenTravel version.',
        usedFor: 'Answering the broker in the standard their system expects.' },
      { name: '5 · Create the API key', where: 'OTA XML → API keys → Create', what: 'The broker’s live key, shown once with a ready message for the broker. Only a fingerprint is stored.',
        usedFor: 'Giving the broker access. Send it securely, never in the same email as the documentation.' },
      { name: '6 · Certification and go-live', where: 'Channel → Go-live → Run certification', what: 'Every broker message is tested in the sandbox and each result is shown; the checklist tracks what is agreed.',
        usedFor: 'Proving the connection works. When the broker has tested too, “Approve go-live” switches them to real bookings.' },
    ],
  },
  {
    id: '03-rates-publishing', title: 'Rates and publishing', length: '1:00',
    summary: 'The prices a broker is quoted, how they are published and what the broker receives.',
    pages: [
      { name: 'Rates', where: 'Channel → Rates', what: 'The price per day for each car group, by season and by rental length.',
        usedFor: 'Setting the prices brokers sell at. Changes stay a draft until you publish them; the grid can be imported and exported in Excel.' },
      { name: 'Publish history', where: 'Channel → Publish history', what: 'Every published version of the rates, who published it and when.',
        usedFor: 'Checking what was sent and rolling back a wrong change in one step.' },
      { name: 'XML feed', where: 'Channel → XML feed', what: 'The rate sheet exactly as the broker receives it.',
        usedFor: 'Answering a broker who asks “which prices did you send us?”.' },
    ],
  },
  {
    id: '04-pricing-rules', title: 'Price rules, rate rules, extras and terms', length: '1:28',
    summary: 'Commercial terms per broker, dynamic pricing for seasons and last-minute, extras and rental terms.',
    pages: [
      { name: 'Price rules', where: 'Channel → Price rules', what: 'This broker’s own commercial terms: markup or discount, prices by day of the week, early-booking and last-minute changes, minimum days and closed dates.',
        usedFor: 'Giving one broker different terms from the others, with an example price before you save.' },
      { name: 'Rate rules', where: 'OTA XML → Rate rules', what: 'Seasons, holidays and events, and last-minute pricing, calculated day by day for the brokers you choose.',
        usedFor: 'Raising prices for Eid or the summer, or lowering them for last-minute bookings, without editing every rate. “Try a price” shows the result.' },
      { name: 'Extras', where: 'Channel → Extras', what: 'What this broker may sell with a car (GPS, child seat, extra driver) and at what price.',
        usedFor: 'Choosing which extras each broker offers.' },
      { name: 'Terms', where: 'Channel → Terms', what: 'The rental conditions sent with every quote and booking, in English and Arabic.',
        usedFor: 'Making sure customers booking through a broker see your conditions.' },
    ],
  },
  {
    id: '05-connection-keys', title: 'Connection, API keys and the XML layout', length: '1:14',
    summary: 'How a broker reaches you, the keys they use and the OpenTravel layout of your answers.',
    pages: [
      { name: 'Connection', where: 'Channel → Connection', what: 'The broker’s contacts and the addresses they send messages to (XML, SOAP, 2018A and 2024A).',
        usedFor: 'Giving the broker their connection details and keeping their contacts on record.' },
      { name: 'OpenTravel XML layout', where: 'Channel → Connection', what: '“OpenTravel standard” answers exactly as the official OpenTravel rules require; “As connected” keeps the layout an existing broker was built against.',
        usedFor: 'Using the standard layout for every new broker, and switching existing brokers only after they confirm.' },
      { name: 'Schema check', where: 'Channel → Connection', what: 'Every message is checked against the official OpenTravel rules. “Report only” shows problems in Traffic; “Strict” refuses invalid messages.',
        usedFor: 'Finding mistakes in a broker’s messages without stopping their bookings.' },
      { name: 'OpenTravel release and SOAP version', where: 'Channel → Connection', what: 'A record of the OpenTravel version and SOAP version agreed with the broker.',
        usedFor: 'Comparing what was agreed with what Traffic shows the broker really sends.' },
      { name: 'API keys', where: 'OTA XML → API keys', what: 'One secret key per broker: a live key and an optional test key that only makes sandbox bookings. A key is shown once; only a fingerprint is stored.',
        usedFor: 'Giving a broker access, replacing a key that may be known to someone else, or revoking it at once.' },
    ],
  },
  {
    id: '06-advanced-connection', title: 'Booking API, languages, security, API v3 and outbound', length: '1:18',
    summary: 'Booking rules and branches, Arabic texts, who is calling, REST v3 with OAuth and what we send to the broker.',
    pages: [
      { name: 'Booking API', where: 'Channel → Booking API', what: 'The branches the broker may use, their opening hours and holidays, and the booking rules (driver age, how far ahead, longest rental, fees, cancellation, no-shows).',
        usedFor: 'Controlling what a broker can book. Changes and cancellations you make are sent to the broker automatically.' },
      { name: 'Languages', where: 'Channel → Languages', what: 'Arabic names and texts.',
        usedFor: 'Brokers that ask in Arabic get Arabic answers.' },
      { name: 'Security', where: 'Channel → Security', what: 'Every address that called with this broker’s code, failed sign-ins and locked addresses; IP limits and signed requests.',
        usedFor: 'Spotting someone trying wrong keys, and locking a broker to its own servers.' },
      { name: 'API v3', where: 'Channel → API v3', what: 'REST/JSON access with OAuth clients (exact permissions) and webhook notifications.',
        usedFor: 'Connecting modern brokers that do not use XML.' },
      { name: 'Outbound', where: 'Channel → Outbound', what: 'What we send to the broker’s own system: rate files, availability updates and booking notifications.',
        usedFor: 'Brokers that want updates pushed to them instead of asking us.' },
    ],
  },
  {
    id: '07-booking-over-xml', title: 'A booking over XML, step by step', length: '1:53',
    summary: 'What a broker sends and what we answer, message by message, in the test console (sandbox: nothing real is booked).',
    pages: [
      { name: 'Test console', where: 'Channel → Test console', what: 'Sends real broker messages to this channel in the sandbox; nothing is booked for real and no updates are sent.',
        usedFor: 'Checking a setup, or showing a broker how a message should look.' },
      { name: '1 · Ping', where: 'OTA_PingRQ', what: 'The broker checks the connection; the answer says Success and repeats their text.', usedFor: 'The first test of any new connection.' },
      { name: '2 · Availability & rates', where: 'OTA_VehAvailRateRQ', what: 'The broker’s search (branch, dates, driver age). The answer lists each car group with its price, extras, cancellation terms and an offer number.',
        usedFor: 'What the broker shows its customers.' },
      { name: '3 · Book', where: 'OTA_VehResRQ', what: 'The broker books an offer; the answer confirms it with our reservation number (RSV-…). The same broker reference sent again returns the same booking, never a second one.',
        usedFor: 'Real bookings, safe against retries.' },
      { name: '4 · Retrieve, modify, cancel', where: 'OTA_VehRetResRQ · OTA_VehModifyRQ · OTA_VehCancelRQ', what: 'Read the booking back, change its dates (re-priced, car checked as free) or cancel it under your terms.',
        usedFor: 'Everything a broker does after booking.' },
      { name: 'Run full booking flow', where: 'Channel → Test console', what: 'Runs search, rules, book, retrieve and cancel in one click.', usedFor: 'The quickest check after any change.' },
    ],
  },
  {
    id: '08-daily-work', title: 'Daily work: bookings and traffic', length: '1:24',
    summary: 'Where broker bookings arrive and how to read every message they send.',
    pages: [
      { name: 'XML reservations', where: 'OTA XML → XML reservations', what: 'Every booking received from the brokers, kept apart from your own Reservations screen.',
        usedFor: 'Seeing upcoming, on-rent, completed and cancelled broker bookings; switching between live and sandbox.' },
      { name: 'Bookings', where: 'Channel → Bookings', what: 'One broker’s bookings, with a monthly statement.',
        usedFor: 'Checking a broker’s bookings and preparing their invoice.' },
      { name: 'Traffic', where: 'Channel → Traffic', what: 'Every message the broker sent and every answer, with the time taken; keys and card numbers are hidden. “What the broker sends” shows the version and SOAP they really use; an amber “Schema” label marks messages that miss something the OpenTravel rules require.',
        usedFor: 'Answering “why did my booking fail?”: open the message and see exactly what was sent and answered.' },
    ],
  },
  {
    id: '09-dashboard-bulk-stops', title: 'Dashboard, bulk editor and stop sales', length: '0:53',
    summary: 'Figures across every broker, changing many brokers at once, and closing cars for some dates.',
    pages: [
      { name: 'Dashboard', where: 'OTA XML → Dashboard', what: 'Requests, bookings, revenue, errors and alerts across every broker.',
        usedFor: 'Seeing who sells most and who has problems.' },
      { name: 'Bulk editor', where: 'OTA XML → Bulk editor', what: 'Change rates, extras, terms and policies for several brokers at once, with a preview.',
        usedFor: 'Saving time when the same change applies to many brokers.' },
      { name: 'Stop sales', where: 'OTA XML → Stop sales', what: 'Close a car or car group for some dates, for every broker or chosen ones.',
        usedFor: 'Keeping cars for walk-in customers or maintenance; brokers stop seeing them at once.' },
    ],
  },
  {
    id: '10-developer', title: 'Developer page and broker documentation', length: '0:50',
    summary: 'What brokers read to connect, and the technical details for their developers.',
    pages: [
      { name: 'Developer', where: 'OTA XML → Developer', what: 'Addresses, message types, error codes, downloads and examples.',
        usedFor: 'Answering technical questions from a broker’s developers.' },
      { name: 'Developer portal', where: '/ota/developers (public page)', what: 'The guide you send to brokers: authentication, sandbox and production, every message, sample answers checked against the official rules, limits and the go-live checklist. Shows only “UR-Drive Jordan”, never keys.',
        usedFor: 'Sending one link to a new broker instead of long emails.' },
    ],
  },
];
