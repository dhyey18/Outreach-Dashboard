#!/usr/bin/env python3
"""Simplifies STAGE1 message templates to just two branches: no website vs has website"""

import re

path = '/home/dhyeypatel/Documents/Dhyey/scrapper/what\'sappreachout/whatsapp.js'

# Read file
with open(path, 'r', encoding='utf8') as f:
    content = f.read()

# Find and replace the entire STAGE1 object
stage1_pattern = r'const STAGE1 = \{[\s\S]*?\n\};'

# New STAGE1 with simplified two-branch templates
new_stage1 = '''const STAGE1 = {
    dental: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's live — but not optimised to convert visitors into bookings.\\n\\nA focused update brings 15–20 more appointment requests/month from Google.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for *${name}* in Ahmedabad — you don't have a website.\\n\\nPatients searching online can't find or book with you. A professional dental website brings 10–15 appointment requests/month from Google — no ads needed.\\n\\nWorth setting up?\\n\\n— Dhyey`,

    clinic: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's up — but not optimised for patient conversions.\\n\\nA focused update brings 8–12 new patient inquiries/month from Google.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for clinics in Ahmedabad — *${name}* doesn't have a website.\\n\\nPatients researching online can't find you. A simple clinic website brings 8–12 new patient inquiries/month — no ads needed.\\n\\nWant to know more?\\n\\n— Dhyey`,

    restaurant: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised for online orders.\\n\\nAn improved site brings 20–30 extra orders/month from people researching online.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for restaurants in Ahmedabad — *${name}* doesn't have a website or online menu.\\n\\nPeople research online before choosing where to eat. A website + menu page brings 20–30 extra orders/month.\\n\\nWorth building one?\\n\\n— Dhyey`,

    realestate: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised to attract buyer inquiries.\\n\\nA focused update brings more direct buyer calls from Google.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for property agents in Ahmedabad — *${name}* doesn't have a website.\\n\\nBuyers search online before calling agents. A professional site brings consistent buyer inquiries without OTA commissions.\\n\\nWorth building?\\n\\n— Dhyey`,

    fitness: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's live — but not optimised to convert visitors into memberships.\\n\\nA focused update brings 15–25 more trial inquiries/month.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for gyms in Ahmedabad — *${name}* doesn't have a website.\\n\\nPeople researching gyms online want to see pricing, classes, and trials. A gym website brings 15–25 trial inquiries/month.\\n\\nWorth setting up?\\n\\n— Dhyey`,

    education: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's up — but not optimised for student conversions.\\n\\nA focused update brings 30–40 more student inquiries/month.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for coaching institutes in Ahmedabad — *${name}* doesn't have a website.\\n\\nParents and students research online before enrolling. A professional site brings 30–40 student inquiries/month.\\n\\nWorth building?\\n\\n— Dhyey`,

    interior: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised to showcase work.\\n\\nA focused update brings more project inquiries.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for interior designers in Ahmedabad — *${name}* doesn't have a website or portfolio.\\n\\nClients want to see your work before reaching out. A portfolio site brings consistent project inquiries.\\n\\nWorth creating one?\\n\\n— Dhyey`,

    clothing: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised for online sales.\\n\\nAn updated site brings 25–40 more orders/month.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for clothing stores in Ahmedabad — *${name}* doesn't have a website or catalogue.\\n\\nCustomers want to browse online. A catalogue + WhatsApp brings 25–40 extra orders/month.\\n\\nWorth setting up?\\n\\n— Dhyey`,

    jewellery: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's up — but not optimised to attract buyers.\\n\\nA focused update brings more WhatsApp and in-store inquiries.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for jewellery shops in Ahmedabad — *${name}* doesn't have a website or catalogue.\\n\\nBuyers want to see designs and prices online. A catalogue brings consistent inquiries.\\n\\nWorth creating one?\\n\\n— Dhyey`,

    manufacturing: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised for B2B inquiries.\\n\\nAn improved site brings more inbound leads.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for manufacturers in Ahmedabad — *${name}* doesn't have a website.\\n\\nB2B buyers search online before shortlisting vendors. A professional site brings consistent inquiries.\\n\\nWorth building?\\n\\n— Dhyey`,

    immigration: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's up — but not optimised for client conversions.\\n\\nA focused update brings 15–20 more inquiries/month.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for immigration consultants in Ahmedabad — *${name}* doesn't have a website.\\n\\nClients want to verify credibility before calling. A professional site brings 15–20 client inquiries/month.\\n\\nWorth building?\\n\\n— Dhyey`,

    photography: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised to showcase work.\\n\\nA focused update brings 10–15 more inquiries/month.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for photographers in Ahmedabad — *${name}* doesn't have a website or portfolio.\\n\\nClients want to see your work before booking. A portfolio site brings 10–15 direct bookings/month.\\n\\nWorth creating?\\n\\n— Dhyey`,

    ca: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's up — but not optimised for client conversions.\\n\\nA focused update brings 10–15 more inquiries/month.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for CAs and tax consultants in Ahmedabad — *${name}* doesn't have a website.\\n\\nClients research before hiring. A professional site brings 10–15 client inquiries/month.\\n\\nWorth building?\\n\\n— Dhyey`,

    events: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised to showcase work.\\n\\nA focused update brings more event inquiries.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for event planners in Ahmedabad — *${name}* doesn't have a website or portfolio.\\n\\nClients want to see your work before booking. A portfolio site brings consistent event inquiries.\\n\\nWorth creating?\\n\\n— Dhyey`,

    automobile: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's up — but not optimised for service bookings.\\n\\nA focused update brings more service inquiries.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for car service centres in Ahmedabad — *${name}* doesn't have a website.\\n\\nCustomers search online before visiting. A professional site brings consistent service bookings.\\n\\nWorth building?\\n\\n— Dhyey`,

    hotel: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's there — but not optimised for direct bookings.\\n\\nA focused update reduces OTA dependency.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for hotels in Ahmedabad — *${name}* doesn't have a website.\\n\\nGuests book online before arriving. A professional site brings direct bookings without OTA commissions.\\n\\nWorth building?\\n\\n— Dhyey`,

    pharmacy: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's up — but not optimised for orders.\\n\\nA focused update brings more WhatsApp orders.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for pharmacies in Ahmedabad — *${name}* doesn't have a website.\\n\\nCustomers order online now. A site + WhatsApp brings orders without app commissions.\\n\\nWorth building?\\n\\n— Dhyey`,

    generic: (name, hasWebsite) => hasWebsite
        ? `Hi —\\n\\nChecked *${name}*'s website. It's live — but not optimised to convert visitors.\\n\\nA focused update brings 10–20 more inquiries/month.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        : `Hi —\\n\\nSearched for *${name}* in Ahmedabad — you don't have a website.\\n\\nCustomers search online now. A professional site brings 10–20 new inquiries/month.\\n\\nWorth building?\\n\\n— Dhyey`,
};'''

# Replace
content = re.sub(stage1_pattern, new_stage1, content)

# Write back
with open(path, 'w', encoding='utf8') as f:
    f.write(content)

print('✅  All message templates simplified to two branches')
