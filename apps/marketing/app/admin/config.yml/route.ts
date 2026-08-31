import { NextResponse } from "next/server";

// Served dynamically (not a static public/ file) so `base_url` always matches
// whatever origin actually loaded /admin — production, a Vercel preview
// deployment, or localhost — instead of being hardcoded to one domain, which
// otherwise breaks Decap's OAuth popup everywhere except that one domain.
function configYaml(origin: string) {
  return `backend:
  name: github
  repo: RonanOD/dailyscribe
  branch: main
  base_url: ${origin}
  auth_endpoint: api/decap-oauth/auth

publish_mode: simple
media_folder: "apps/marketing/public/uploads"
public_folder: "/uploads"

collections:
  - name: landing
    label: "Landing Page"
    files:
      - file: "apps/marketing/content/landing.yml"
        label: "Landing Page"
        name: landing
        fields:
          - { label: "Dateline (small label above the headline)", name: dateline, widget: string }
          - { label: "Hero Heading", name: hero_heading, widget: string }
          - { label: "Hero Subheading", name: hero_subheading, widget: text }
          - { label: "Hero Image", name: hero_image, widget: image }
          - { label: "Hero Image Alt Text", name: hero_image_alt, widget: string }
          - label: "Teaser Columns"
            name: teasers
            widget: list
            fields:
              - { label: Kicker, name: kicker, widget: string }
              - { label: Title, name: title, widget: string }
              - { label: Body, name: body, widget: text }
              - { label: "Anchor (matches a Feature Deep-Dive id below)", name: anchor, widget: string }
          - label: "How It Works Steps"
            name: how_it_works
            widget: list
            fields:
              - { label: Numeral, name: numeral, widget: string }
              - { label: Title, name: title, widget: string }
              - { label: Body, name: body, widget: text }
          - label: "Sample Edition Download"
            name: sample_edition
            widget: object
            fields:
              - { label: Kicker, name: kicker, widget: string }
              - { label: Heading, name: heading, widget: string }
              - { label: Body, name: body, widget: text }
              - { label: "Button Label", name: button_label, widget: string }
              - { label: "PDF File", name: file, widget: file }
          - label: "Waitlist Signup Block"
            name: waitlist
            widget: object
            fields:
              - { label: Heading, name: heading, widget: string }
              - { label: Body, name: body, widget: text }
              - { label: "Button Label", name: button_label, widget: string }
              - { label: "Email Input Placeholder", name: placeholder, widget: string }
              - { label: "Success Message", name: success_message, widget: string }
          - label: "Feature Deep-Dives"
            name: features
            widget: list
            fields:
              - { label: "Id (used as the page anchor)", name: id, widget: string }
              - { label: Kicker, name: kicker, widget: string }
              - { label: Title, name: title, widget: string }
              - { label: Body, name: body, widget: markdown }
              - { label: "Note (small italic line under the body)", name: note, widget: string }
              - { label: "Coming soon", name: coming_soon, widget: boolean, default: false }
              - { label: "Image on the right", name: media_right, widget: boolean, default: false }
              - { label: Image, name: image, widget: image }
              - { label: "Image Alt Text", name: image_alt, widget: string }
          - label: "Premium Bundle Callout"
            name: premium_callout
            widget: object
            fields:
              - { label: Heading, name: heading, widget: string }
              - { label: Body, name: body, widget: text }
              - label: Points
                name: points
                widget: list
                fields:
                  - { label: Heading, name: heading, widget: string }
                  - { label: Body, name: body, widget: string }
          - label: "Plain-Email Reassurance"
            name: plain_email_note
            widget: object
            fields:
              - { label: Heading, name: heading, widget: string }
              - { label: Body, name: body, widget: text }
              - { label: Image, name: image, widget: image }
              - { label: "Image Alt Text", name: image_alt, widget: string }
          - label: "Social Proof Vignettes"
            name: vignettes
            widget: list
            fields:
              - { label: Caption, name: caption, widget: text }
              - { label: Image, name: image, widget: image }
              - { label: "Image Alt Text", name: image_alt, widget: string }
          - label: "Final Call to Action"
            name: final_cta
            widget: object
            fields:
              - { label: Heading, name: heading, widget: string }
              - { label: Body, name: body, widget: text }
`;
}

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return new NextResponse(configYaml(origin), {
    headers: { "Content-Type": "text/yaml; charset=utf-8" },
  });
}
