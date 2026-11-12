# MeetBook GitHub Pages Deployment

## Intended address

`https://mdmamunhossenlimoiii-creator.github.io/MeetBook/`

This URL is derived from the repository owner and repository name. It is configured as the canonical URL in the page metadata and sitemap. It is not a claim that Pages is enabled or the site is published.

## Owner setup

1. Open the MeetBook repository Settings.
2. Open Pages.
3. Select the intended source (for this static app, deploying from `main` and the repository root is supported by the current relative asset paths).
4. Save the setting and wait for GitHub's deployment to finish.
5. Open the published URL and verify the home page, static assets, hash routes and browser console.
6. Add the actual Pages hostname to the MeetBook Firebase Authentication authorized domains.

Do not publish until the owner explicitly authorizes it. Do not reuse MySocial's Pages hostname or custom domain.

## Metadata

The repository includes a canonical URL, Open Graph metadata, a web manifest, `robots.txt`, and `sitemap.xml`. Update these if the owner later configures a custom domain.
