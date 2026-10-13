# OrthoScribe AI Web 0.2.0: upload-ready demonstration

This folder contains the static application, not an installer. It retains the
brief note format, NV/NNV plans, separate case notes, and Dr. Reza sign-off.

## Publish to your existing GitHub repository

1. Extract this ZIP on a computer. Open the extracted folder.
2. In mehrdad-Farimani/orthoscribe-ai-web, open Code > Add file > Upload files.
3. Drag all the files and the assets folder into the upload area. Upload the
   contents, not the ZIP or its enclosing folder. The repository root must
   contain index.html, app.js, styles.css, and assets/.
4. Commit the upload to main.
5. Open Settings > Pages. Choose Deploy from a branch, main, /(root), then Save.
6. Check the repository Actions tab for the Pages deployment result. Open the
   site address shown by GitHub only after that deployment succeeds.

This package does not need Node.js, Xcode, API keys, or a custom Actions workflow
on your computer. The source release also provides a separate tested Actions
workflow, but it is not needed for this branch-publishing package.

## Scope

This is a fictional-data demonstration. It does not record microphone audio,
call live AI, authenticate clinical users, or send real email. Demo edits reset
on refresh. Do not enter real patient information. A separate clinic-approved
backend and host are required before real clinical use.

## Verification performed on this source

77 JavaScript tests passed. The static package passed 229 assertions.
These checks do not establish a successful GitHub deployment, physical iPhone
compatibility, clinical accuracy, or regulatory compliance.

## Platform references

https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
