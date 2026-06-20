#!/usr/bin/env python3
"""Adds socialOnly branch to all STAGE1 templates."""
import re

path = '/home/dhyeypatel/Documents/Dhyey/scrapper/what\'sappreachout/whatsapp.js'
with open(path, 'r', encoding='utf8') as f:
    content = f.read()

# Social-only pitch suffix used across all industries
# Format: industry -> (social_pitch_ending, no_website_ending)
# We'll build the full 3-branch function for each industry

industries = {
    'dental': (
        "only has a Facebook/Instagram page — patients searching Google for a dental clinic can't find you at all.",
        "10–15 appointment requests/month from Google"
    ),
    'clinic': (
        "only has a social media page — patients searching for clinics on Google can't find you.",
        "8–12 new patient inquiries/month from Google"
    ),
    'restaurant': (
        "only has a Facebook/Instagram page — people searching for restaurants online can't find your menu or location easily.",
        "20–30 extra orders/month from people searching online"
    ),
    'realestate': (
        "only has a social media page — buyers searching for property agents on Google won't find you.",
        "consistent buyer inquiries without OTA commissions"
    ),
    'fitness': (
        "only has a Facebook/Instagram page — people searching for gyms near them on Google won't find you.",
        "15–25 trial inquiries/month from local search"
    ),
    'education': (
        "only has a social media page — parents searching for coaching institutes on Google can't find you.",
        "30–40 student inquiries/month from Google"
    ),
    'interior': (
        "only has a Facebook/Instagram page — clients searching for interior designers on Google won't find your portfolio.",
        "consistent project inquiries from Google"
    ),
    'clothing': (
        "only has a social media page — customers searching online for clothing stores can't browse or order from you easily.",
        "25–40 extra orders/month from online customers"
    ),
    'jewellery': (
        "only has a Facebook/Instagram page — buyers searching for jewellery online won't find your designs or gold rates.",
        "consistent inquiries from online buyers"
    ),
    'manufacturing': (
        "only has a social media page — B2B buyers searching for manufacturers on Google won't find you.",
        "consistent B2B inquiries from Google"
    ),
    'immigration': (
        "only has a Facebook/Instagram page — clients searching for immigration consultants on Google can't find you.",
        "15–20 client inquiries/month from Google"
    ),
    'photography': (
        "only has an Instagram/Facebook page — clients searching for photographers on Google can't find your portfolio.",
        "10–15 direct booking inquiries/month"
    ),
    'ca': (
        "only has a social media page — clients searching for CAs and tax consultants on Google won't find you.",
        "10–15 client inquiries/month from Google"
    ),
    'events': (
        "only has a Facebook/Instagram page — clients searching for event planners on Google can't see your work.",
        "consistent event booking inquiries"
    ),
    'automobile': (
        "only has a social media page — customers searching for car service centres on Google won't find you.",
        "consistent service bookings from Google"
    ),
    'hotel': (
        "only has a Facebook/Instagram page — guests searching for hotels on Google can't book directly with you.",
        "direct bookings without OTA commissions"
    ),
    'pharmacy': (
        "only has a social media page — customers searching for pharmacies online can't order from you.",
        "more orders without app commissions"
    ),
    'generic': (
        "only has a social media page — customers searching on Google can't find you.",
        "10–20 new inquiries/month from Google"
    ),
}

# Build new STAGE1 block
new_lines = ['const STAGE1 = {']

for ind, (social_issue, no_web_benefit) in industries.items():
    block = f'''    {ind}: (name, hasWebsite, socialOnly) => {{
        if (hasWebsite) return (
            `Hi —\\n\\nChecked *${{name}}*'s website. It's live — but not optimised to convert visitors.\\n\\nA focused update brings {no_web_benefit}.\\n\\nWant to know what to improve?\\n\\n— Dhyey`
        );
        if (socialOnly) return (
            `Hi —\\n\\nSearched for *${{name}}* on Google — the business {social_issue}\\n\\nA proper website means customers can find and contact you from Google search directly. That brings {no_web_benefit}.\\n\\nWorth building?\\n\\n— Dhyey`
        );
        return (
            `Hi —\\n\\nSearched for *${{name}}* in Ahmedabad — you don't have a website.\\n\\nCustomers searching online can't find you at all. A professional website brings {no_web_benefit}.\\n\\nWorth setting up?\\n\\n— Dhyey`
        );
    }},
'''
    new_lines.append(block)

new_lines.append('};')
new_stage1 = '\n'.join(new_lines)

# Replace the entire STAGE1 block
stage1_pattern = r'const STAGE1 = \{[\s\S]*?\n\};'
content = re.sub(stage1_pattern, new_stage1, content)

with open(path, 'w', encoding='utf8') as f:
    f.write(content)

print('✅  STAGE1 templates updated with social-only branch')
