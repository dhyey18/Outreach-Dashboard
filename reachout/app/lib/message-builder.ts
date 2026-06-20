// Ported from whatsapp.js — all message templates for 27 industries

export type Industry = keyof typeof STAGE1;

function isSocialUrl(url: string): boolean {
  return !!(url && /facebook\.com|fb\.com|fb\.me|instagram\.com/i.test(url));
}

function detectIndustry(lead: Record<string, unknown>): Industry {
  const allTypes = [
    String(lead.type || ''),
    ...(Array.isArray(lead.types) ? lead.types : []),
    ...(Array.isArray(lead.type_ids) ? lead.type_ids : []),
  ].join(' ').toLowerCase();

  if (/dental|dentist/.test(allTypes)) return 'dental';
  if (/nursing.?home|surgical|maternity.?hosp/.test(allTypes)) return 'hospital';
  if (/patholog|diagnostic|radiol|blood.?test/.test(allTypes)) return 'diagnostic';
  if (/clinic|doctor|physician|medical|health|physiotherapy|ayurved/.test(allTypes)) return 'clinic';
  if (/restaurant|cafe|food|dhaba|bakery/.test(allTypes)) return 'restaurant';
  if (/real.?estate|property|builder|developer|apartment/.test(allTypes)) return 'realestate';
  if (/marriage.?hall|banquet|wedding.?venue|party.?hall/.test(allTypes)) return 'wedding_venue';
  if (/gym|fitness|yoga|pilates|sports/.test(allTypes)) return 'fitness';
  if (/school|college|coaching|tutor|education|institute/.test(allTypes)) return 'education';
  if (/interior|architect|renovation|decor/.test(allTypes)) return 'interior';
  if (/cloth|apparel|fashion|boutique|saree|garment/.test(allTypes)) return 'clothing';
  if (/jewel|gold|silver|diamond/.test(allTypes)) return 'jewellery';
  if (/manufact|factory|industri|engineer|fabricat/.test(allTypes)) return 'manufacturing';
  if (/packer|mover|courier|transport|cargo|logistics/.test(allTypes)) return 'logistics';
  if (/print|flex.?print|digital.?print|visiting.?card/.test(allTypes)) return 'printing';
  if (/insurance|mutual.?fund|financial.?advis|loan.?agent/.test(allTypes)) return 'financial';
  if (/immigr|visa/.test(allTypes)) return 'immigration';
  if (/tour|travel.?agenc|holiday/.test(allTypes)) return 'travel';
  if (/photo|studio|videograph|cinemat/.test(allTypes)) return 'photography';
  if (/chartered.?account|ca firm|tax.?consult|audit|gst.?consult/.test(allTypes)) return 'ca';
  if (/advocate|lawyer|law.?firm|legal/.test(allTypes)) return 'legal';
  if (/event|wedding.?plan|decorator|caterer/.test(allTypes)) return 'events';
  if (/beauty|parlour|salon|spa|nail|makeup/.test(allTypes)) return 'beauty';
  if (/mobile.?repair|laptop.?repair|computer.?repair|electronic/.test(allTypes)) return 'electronics';
  if (/auto|car|vehicle|garage|mechanic|bike|motorcycle|tyre/.test(allTypes)) return 'automobile';
  if (/hotel|lodge|guest.?house|hostel|resort|stay/.test(allTypes)) return 'hotel';
  if (/pharmac|chemist|drug.?store|medicine/.test(allTypes)) return 'pharmacy';
  return 'generic';
}

// ─── Stage 1 templates ────────────────────────────────────────────────────────

const STAGE1 = {
  dental: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's up but honestly doesn't seem like it's pulling patients from Google.\n\nSmall changes usually make a big difference for local clinics. Happy to take a proper look if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only an Instagram page came up.\n\nMost patients use Google when they're looking for a dentist, not social media. A proper website gets you into those results. I build them for ₹8,000, usually up in a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up dental clinics in ${city} and noticed *${name}* doesn't show up on Google at all.\n\nPatients searching online right now are just going to whoever comes up first. I build websites for dental clinics — ₹8,000 one-time, ready in about a week.\n\nWorth a chat?\n\n${contact}`;
  },
  clinic: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's there, but doesn't seem to be showing up in local Google searches the way it should.\n\nA few tweaks usually sort this out. Happy to take a look if you're interested.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* — only a social media page showed up on Google.\n\nPatients searching for a clinic on Google need an actual website to find and contact you directly. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up *${name}* in ${city} — no website came up.\n\nPeople searching for a doctor online in ${city} are just calling whoever shows up on Google first. I build clinic websites — ₹8,000, done in about a week.\n\nInterested?\n\n${contact}`;
  },
  restaurant: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nHad a look at *${name}*'s website — it's live but I don't think it's doing much for online orders or walk-ins from search.\n\nA few changes can really help with this. Let me know if you want me to take a closer look.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* — only Facebook came up, no website.\n\nPeople searching for a restaurant in ${city} online usually want to see a menu or place an order. Hard to do that on a Facebook page. I build restaurant websites for ₹8,000, ready in a week.\n\n${contact}`;
    return `Hi —\n\nLooked up *${name}* in ${city} — no website, just a Google Maps listing.\n\nPeople searching for somewhere to eat right now can't really find you online. I build restaurant websites — ₹8,000, up in about a week.\n\nWorth it?\n\n${contact}`;
  },
  realestate: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's there, but I don't think it's generating buyer inquiries on its own.\n\nFixing a few things usually starts bringing in leads without having to share commission with anyone. Happy to look into it.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — just a social media page came up.\n\nBuyers searching for a property agent in ${city} on Google won't find you there. A proper website puts you in front of them directly — no OTA cut. I build them for ₹8,000, live in a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up property agents in ${city} and *${name}* doesn't come up on Google.\n\nBuyers searching online are going to whoever shows up first. A website gets you there — and every inquiry comes straight to you, no commission to anyone. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  fitness: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's live but I don't think it's pulling in new members from Google search.\n\nUsually a few changes make a real difference for gyms and studios. Happy to take a look if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only Instagram came up.\n\nPeople searching for a gym in ${city} use Google, not just Instagram. A proper website gets you in those results. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up gyms and fitness studios in ${city} — *${name}* doesn't show up on Google.\n\nPeople searching for a place to work out are signing up wherever comes up first. I build websites for gyms and studios — ₹8,000, done in about a week.\n\n${contact}`;
  },
  education: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nHad a look at *${name}*'s website — it's up, but I don't think parents searching on Google are finding it easily.\n\nA few things usually fix this for coaching institutes. Happy to check properly if you're interested.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nParents looking for coaching classes in ${city} search on Google, not Instagram. A website gets you on that list. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nWas searching for coaching institutes in ${city} — *${name}* doesn't show up on Google.\n\nParents looking for classes are enrolling wherever comes up first. I build websites for coaching institutes — ₹8,000, ready in about a week.\n\nInterested?\n\n${contact}`;
  },
  interior: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — the portfolio looks good, but it's not showing up well when people search for interior designers in ${city} on Google.\n\nHappy to look at what's holding it back if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — just Instagram came up, no website.\n\nClients searching for an interior designer in ${city} on Google won't find your work there. A proper website puts your portfolio in front of them. I build them for ₹8,000, live in a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up interior designers in ${city} — *${name}* doesn't come up on Google.\n\nClients searching online are reaching out to whoever shows up. A website puts your work in front of them directly. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  clothing: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's there, but I don't think it's driving many sales from Google search.\n\nA few changes usually help a lot with this for clothing stores. Let me know if you want me to check.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for clothing stores in ${city} online can't browse or order from a Facebook page easily. A proper website fixes that. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up clothing stores in ${city} — *${name}* doesn't come up on Google.\n\nPeople searching to buy clothes online in ${city} right now are going to whoever shows up. I build clothing store websites — ₹8,000, done in about a week.\n\n${contact}`;
  },
  jewellery: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nHad a look at *${name}*'s website — it's up, but I don't think buyers searching on Google are finding it.\n\nHappy to check what's going on and see if it's an easy fix.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* — only Facebook came up on Google.\n\nPeople searching for jewellery in ${city} online want to see the collection before visiting. A website makes that easy. I build them for ₹8,000, ready in a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up jewellery shops in ${city} — *${name}* doesn't come up on Google at all.\n\nBuyers searching online are walking into whoever they find first. A website puts your shop on that list. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  manufacturing: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's live but not really showing up when buyers search on Google.\n\nFor B2B this can mean missing a lot of inbound orders. Happy to look at it if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nB2B buyers searching for manufacturers in ${city} won't find you there. A proper website gets you in front of them. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up *${name}* in ${city} — no website came up on Google.\n\nBuyers searching for manufacturers online are going to whoever shows up. A website gets you in front of them — I build them for ₹8,000, done in about a week.\n\n${contact}`;
  },
  immigration: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's there, but I don't think it's pulling in client inquiries from Google search.\n\nA few things usually fix this for immigration consultancies. Happy to take a look.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for an immigration consultant in ${city} use Google, not social media. A website gets you in front of them. I build them for ₹8,000, live in a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up immigration consultants in ${city} — *${name}* doesn't show up on Google.\n\nPeople searching for visa help are contacting whoever comes up first. I build websites for consultancies — ₹8,000, ready in about a week.\n\nInterested?\n\n${contact}`;
  },
  photography: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nHad a look at *${name}*'s website — the work looks great, but Google isn't really surfacing it for people searching locally.\n\nHappy to look at what's going on if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only Instagram came up.\n\nClients searching for a photographer in ${city} on Google can't find your portfolio there. A proper website puts it in front of them. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up photographers in ${city} — *${name}* doesn't come up on Google.\n\nClients searching for photography right now are booking whoever they find first. I build websites for photographers — ₹8,000, done in about a week.\n\n${contact}`;
  },
  ca: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's up, but doesn't seem to be showing in local Google results for CA and tax services.\n\nUsually a straightforward fix. Happy to check if you're interested.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nBusinesses searching for a CA in ${city} on Google won't find you there. A proper website gets you in front of them. I build them for ₹8,000, ready in a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up CA firms in ${city} — *${name}* doesn't come up on Google.\n\nBusinesses looking for tax and accounting help are going to whoever they find first. A website gets you on that list. I build them for ₹8,000, done in about a week.\n\n${contact}`;
  },
  events: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's live, but I don't think clients searching for event planners in ${city} are finding it.\n\nA few things usually help with this. Happy to take a look.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only Facebook came up.\n\nClients planning an event in ${city} search on Google first. A proper website shows them your work and gets you the inquiry. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up event planners in ${city} — *${name}* doesn't show up on Google.\n\nClients planning events are reaching out to whoever they find first. A website puts you in front of them. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  automobile: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's there, but I don't think it's bringing in bookings from Google search.\n\nA few changes usually make a real difference for service centres. Happy to check if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for a car service centre in ${city} on Google won't find you there. A website puts you on that list. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up car service centres in ${city} — *${name}* doesn't come up on Google.\n\nPeople searching for a mechanic or service centre online are going to whoever shows up. I build websites for auto businesses — ₹8,000, done in about a week.\n\n${contact}`;
  },
  hotel: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nHad a look at *${name}*'s website — it's live, but guests are probably still finding you through OTAs and you're paying commission every time.\n\nA proper direct booking setup on your own site fixes that. Happy to look into it.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a Facebook page came up.\n\nGuests looking for a hotel in ${city} can't book directly with you — they go to MakeMyTrip or OYO instead and you lose a cut on every booking. A proper website sorts that out. I build them for ₹8,000, up in a week.\n\n${contact}`;
    return `Hi —\n\nLooked up hotels in ${city} — *${name}* doesn't come up on Google directly.\n\nGuests searching online end up booking through OTAs and you pay commission on every stay. A website lets them book directly with you. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  pharmacy: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's there, but I don't think it's pulling orders from Google.\n\nA few changes usually help a lot with this. Happy to take a proper look.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople ordering medicines online in ${city} use apps like PharmEasy and you pay commission every time. A proper website lets them order directly from you. I build them for ₹8,000, up in a week.\n\n${contact}`;
    return `Hi —\n\nLooked up *${name}* in ${city} — no website came up.\n\nPeople ordering medicines online go to PharmEasy or 1mg by default — and you pay commission on every order. A website lets them order straight from you. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  beauty: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's up, but I don't think it's pulling in bookings from Google search.\n\nPeople searching for salons and parlours in ${city} usually just call whoever comes up first. Happy to take a look if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only Instagram came up.\n\nMost clients search Google when they want to book a salon or spa — Instagram is for discovery, not bookings. A website gets you on that list. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up salons in ${city} — *${name}* doesn't come up on Google.\n\nPeople searching for a parlour or spa nearby are just calling whoever shows up. I build websites for salons — ₹8,000, done in about a week.\n\n${contact}`;
  },
  legal: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's live, but I don't think clients searching on Google are finding it easily.\n\nPeople looking for a lawyer usually go with whoever comes up first. Happy to take a look if you're interested.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for an advocate in ${city} use Google, not social media. A proper website gets you in front of them. I build them for ₹8,000, live in a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up advocates in ${city} — *${name}* doesn't come up on Google.\n\nClients searching for legal help online contact whoever shows up first. A website gets you on that list. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  diagnostic: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's there, but I don't think it's showing up when people search for labs in ${city} on Google.\n\nPatients booking blood tests or scans usually go with whoever they find first. Happy to look at what's holding it back.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPatients searching for a diagnostic lab in ${city} use Google, not Instagram. A proper website gets you in front of them. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up diagnostic labs in ${city} — *${name}* doesn't come up on Google.\n\nPatients booking blood tests or scans online go to whoever they find first. A website puts you on that list. I build them for ₹8,000, done in about a week.\n\n${contact}`;
  },
  logistics: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nHad a look at *${name}*'s website — it's up, but I don't think it's generating inquiries from Google.\n\nPeople searching for packers and movers usually call whoever comes up first. Happy to take a look.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for movers or transport in ${city} use Google, not Facebook. A proper website gets you in front of them. I build them for ₹8,000, live in a week.\n\n${contact}`;
    return `Hi —\n\nLooked up packers and movers in ${city} — *${name}* doesn't come up on Google.\n\nPeople searching for transport or moving services just call whoever shows up first. I build websites for logistics businesses — ₹8,000, done in about a week.\n\n${contact}`;
  },
  printing: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's live, but I don't think it's pulling in orders from Google search.\n\nBusinesses searching for printing shops usually just go with whoever shows up first. Happy to take a look.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nClients searching for a printing press in ${city} use Google, not Instagram. A proper website gets you in front of them. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up printing shops in ${city} — *${name}* doesn't come up on Google.\n\nBusinesses searching for flex or digital printing just go with whoever shows up first. A website puts you on that list. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  financial: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's there, but I don't think it's generating client inquiries from Google.\n\nPeople searching for insurance or investment advice usually go with whoever they find first. Happy to check what's going on.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for a financial advisor in ${city} use Google. A website gets you in front of them directly. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up financial advisors in ${city} — *${name}* doesn't show up on Google.\n\nClients searching for investment or insurance help go to whoever comes up first. A website gets you on that list. I build them for ₹8,000, done in about a week.\n\n${contact}`;
  },
  hospital: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's up, but I don't think patients searching on Google are easily finding it.\n\nA few changes usually make a real difference for nursing homes and hospitals. Happy to take a proper look if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPatients searching for a hospital or nursing home in ${city} use Google. A proper website gets you in those results. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up hospitals and nursing homes in ${city} — *${name}* doesn't come up on Google.\n\nPatients searching online for medical care go to whoever shows up first. A website gets you on that list. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  wedding_venue: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nHad a look at *${name}*'s website — it's live, but I don't think couples searching for venues in ${city} are finding it.\n\nA few things usually fix this for banquet halls and marriage venues. Happy to take a look.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only Facebook came up.\n\nCouples searching for a wedding or party venue in ${city} use Google. A proper website puts your hall in front of them directly. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up banquet halls in ${city} — *${name}* doesn't come up on Google.\n\nCouples planning weddings search online and book whoever they find first. A website puts your venue on that list. I build them for ₹8,000, ready in about a week.\n\n${contact}`;
  },
  travel: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nChecked *${name}*'s website — it's there, but I don't think it's pulling in inquiries from Google.\n\nPeople searching for travel packages usually book with whoever they find first. Happy to look into it.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for a travel agent in ${city} use Google. A proper website gets you in front of them. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up travel agencies in ${city} — *${name}* doesn't come up on Google.\n\nPeople searching for holiday packages or tours just book with whoever shows up. A website gets you there. I build them for ₹8,000, done in about a week.\n\n${contact}`;
  },
  electronics: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's up, but I don't think it's bringing in customers from Google search.\n\nPeople searching for mobile or laptop repair in ${city} call whoever they find first. Happy to take a look if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only a social media page came up.\n\nPeople searching for phone or laptop repair in ${city} use Google, not Instagram. A proper website gets you in front of them. I build them for ₹8,000, up in about a week.\n\n${contact}`;
    return `Hi —\n\nWas looking up mobile and laptop repair shops in ${city} — *${name}* doesn't come up on Google.\n\nPeople searching for a repair shop just go to whoever shows up first. A website puts you on that list. I build them for ₹8,000, done in about a week.\n\n${contact}`;
  },
  generic: (name: string, hasWebsite: boolean, socialOnly: boolean, city: string, contact: string) => {
    if (hasWebsite) return `Hi —\n\nLooked at *${name}*'s website — it's up, but I don't think it's bringing in inquiries from Google.\n\nUsually a few straightforward changes help a lot. Happy to take a look if you want.\n\n${contact}`;
    if (socialOnly) return `Hi —\n\nSearched for *${name}* on Google — only social media came up.\n\nCustomers searching on Google can't find you there. A proper website puts you in front of them. I build them for ₹8,000, live in about a week.\n\n${contact}`;
    return `Hi —\n\nLooked up *${name}* in ${city} — no website came up on Google.\n\nCustomers searching online right now are going to whoever shows up. I build local business websites — ₹8,000, done in about a week.\n\n${contact}`;
  },
};

// ─── Stage 2 templates ────────────────────────────────────────────────────────

const STAGE2: Record<string, (name: string, contact: string) => string> = {
  dental: (name, c) => `Hi *${name}* —\n\nQuick question, genuinely curious — are most of your new patients coming through referrals, or are some finding you through Google?\n\n— Dhyey (${c})`,
  clinic: (name, c) => `Hi *${name}* —\n\nOut of curiosity — right now, how are most new patients finding your clinic? Referrals, walk-ins, or online?\n\n— Dhyey (${c})`,
  restaurant: (name, c) => `Hi *${name}* —\n\nQuick question — are you currently getting online orders or mostly walk-in customers?\n\n— Dhyey (${c})`,
  realestate: (name, c) => `Hi *${name}* —\n\nGenuine question — are most of your buyer inquiries coming through referrals, or also from Google and social media?\n\n— Dhyey (${c})`,
  fitness: (name, c) => `Hi *${name}* —\n\nQuick question — are new members mostly finding you through word of mouth, or also through Google and Instagram?\n\n— Dhyey (${c})`,
  education: (name, c) => `Hi *${name}* —\n\nGenuine question — are most student inquiries coming through referrals, or are some parents finding you on Google?\n\n— Dhyey (${c})`,
  interior: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your project leads coming through referrals, or are clients also finding you online?\n\n— Dhyey (${c})`,
  clothing: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your customers walk-ins, or are some ordering through WhatsApp or Instagram?\n\n— Dhyey (${c})`,
  jewellery: (name, c) => `Hi *${name}* —\n\nGenuine question — are most customers coming to your shop directly, or are some also reaching out through WhatsApp or Instagram?\n\n— Dhyey (${c})`,
  manufacturing: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your B2B inquiries coming through existing contacts and referrals, or also from online?\n\n— Dhyey (${c})`,
  immigration: (name, c) => `Hi *${name}* —\n\nGenuine question — are most of your clients coming through referrals, or are some finding you through Google?\n\n— Dhyey (${c})`,
  photography: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your bookings coming through referrals, or are some clients also finding you through Google or Instagram?\n\n— Dhyey (${c})`,
  ca: (name, c) => `Hi *${name}* —\n\nGenuine question — are most of your new clients coming through referrals, or are some finding you through Google?\n\n— Dhyey (${c})`,
  events: (name, c) => `Hi *${name}* —\n\nQuick question — are most event enquiries coming through referrals, or are some clients also finding you online?\n\n— Dhyey (${c})`,
  automobile: (name, c) => `Hi *${name}* —\n\nQuick question — are most customers coming through word of mouth, or are some also finding you through Google?\n\n— Dhyey (${c})`,
  hotel: (name, c) => `Hi *${name}* —\n\nGenuine question — are most of your bookings coming through OTAs like MakeMyTrip, or do you also get direct bookings?\n\n— Dhyey (${c})`,
  pharmacy: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your customers walk-ins, or are some also ordering through WhatsApp?\n\n— Dhyey (${c})`,
  beauty: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your bookings coming through walk-ins and referrals, or are some clients also finding you on Google?\n\n— Dhyey (${c})`,
  legal: (name, c) => `Hi *${name}* —\n\nGenuine question — are most of your new clients coming through referrals, or are some finding you through Google?\n\n— Dhyey (${c})`,
  diagnostic: (name, c) => `Hi *${name}* —\n\nQuick question — are most patients booking through a doctor's referral, or are some finding and calling you directly?\n\n— Dhyey (${c})`,
  logistics: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your bookings coming through referrals, or are some customers also finding you through Google?\n\n— Dhyey (${c})`,
  printing: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your orders coming from existing clients, or are some businesses also finding you through Google?\n\n— Dhyey (${c})`,
  financial: (name, c) => `Hi *${name}* —\n\nGenuine question — are most of your clients coming through referrals, or are some finding you through Google or LinkedIn?\n\n— Dhyey (${c})`,
  hospital: (name, c) => `Hi *${name}* —\n\nQuick question — are most patients coming through referrals and walk-ins, or are some also finding you online?\n\n— Dhyey (${c})`,
  wedding_venue: (name, c) => `Hi *${name}* —\n\nGenuine question — are most bookings coming through referrals, or are some couples also finding you through Google?\n\n— Dhyey (${c})`,
  travel: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your clients coming through referrals, or are some also finding your agency through Google?\n\n— Dhyey (${c})`,
  electronics: (name, c) => `Hi *${name}* —\n\nQuick question — are most customers finding you through word of mouth, or are some also finding you on Google?\n\n— Dhyey (${c})`,
  generic: (name, c) => `Hi *${name}* —\n\nQuick question — are most of your customers coming through referrals and word of mouth, or also through Google?\n\n— Dhyey (${c})`,
};

// ─── Analysis message ─────────────────────────────────────────────────────────

function buildAnalysisMessage(name: string, issues: string[]): string {
  const issueList = issues.map(i => `• ${i}`).join('\n');
  return `Hi —\n\nI checked *${name}*'s website and found a few things that are stopping customers from reaching you:\n\n${issueList}\n\nThese are straightforward fixes — businesses that sort them typically see 10–20 more enquiries/month from the same traffic.\n\nWant me to walk you through what to change?\n\n— Dhyey`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildMessage(
  lead: Record<string, unknown>,
  stage: 1 | 2,
  city: string,
  contactName: string,
  contactPhone: string,
): string {
  const name = String(lead.name || lead.title || 'there');
  const industry = detectIndustry(lead);
  const contactStr = `${contactName}\n${contactPhone}`;
  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);

  if (stage === 2) {
    const fn = STAGE2[industry] || STAGE2.generic;
    return fn(name, contactPhone);
  }

  // Stage 1
  const issues = lead._analysis ? (lead._analysis as { issues?: string[] }).issues || [] : (lead.issues as string[] | undefined) || [];
  const socialOnly = isSocialUrl(String(lead.website || ''));
  const hasWebsite = !!(lead.website) && !socialOnly;

  if (hasWebsite && issues.length > 0) {
    return buildAnalysisMessage(name, issues);
  }

  const fn = STAGE1[industry as keyof typeof STAGE1] || STAGE1.generic;
  return fn(name, hasWebsite, socialOnly, cityLabel, contactStr);
}

export function buildPreviewMessage(
  industry: string,
  stage: 1 | 2,
  city: string,
  contactName: string,
  contactPhone: string,
): string {
  const contactStr = `${contactName}\n${contactPhone}`;
  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);
  const name = `Sample Business`;

  if (stage === 2) {
    const fn = STAGE2[industry] || STAGE2.generic;
    return fn(name, contactPhone);
  }

  const fn = STAGE1[industry as keyof typeof STAGE1] || STAGE1.generic;
  return fn(name, false, false, cityLabel, contactStr);
}
