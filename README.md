### [Learnful](https://learnful.co/): Education for Digital Naiveteeees

##### Deployment: [![Build Status](https://api.shippable.com/projects/537af423aae0ace700dc2b39/badge/master)](https://www.shippable.com/projects/537af423aae0ace700dc2b39) &mdash; Chat: [![Gitter chat](https://badges.gitter.im/Learnful/learnful.png)](https://gitter.im/Learnful/learnful) &mdash; Tasks: [Huboard](https://huboard.com/Learnful/learnful/)

* [Production site](https://learnful.co/)
* [What's the idea behind this?](https://github.com/Learnful/learnful/wiki)
* [Release notes](https://github.com/Learnful/learnful/wiki/Release-notes)
* [Contributor Licensing Agreement](https://docs.google.com/a/learnful.co/forms/d/1xJ3sa_lTyC5dzxVeIGAfGP1OBcJV1a65Tv46oK1DfWE/viewform)

Free Nodejitsu drone courtesy of their [open-source program](http://opensource.nodejitsu.com/).

#### Setting up your development environment

1. Install [NodeJS](https://nodejs.org/).

2. `npm install -g grunt-cli bower http-server`

3. Create a new [Firebase](https://firebase.com/) datastore (suggested name: `learnful-dev-<username>`).

4. Set up environment variables in your `.bashrc`:

   ```bash
    export LEARNFUL_FIREBASE=learnful-dev-<username>
    export LEARNFUL_FIREBASE_AUTH=<secret>
   ```

   You can find the auth secret in your Firebase datastore's dashboard, appropriately enough in the
   "Secrets" section.

Big heading
-----------

5. Clone the repository onto your machine.

6. Run the backend code:

   ```
    cd learnful/server
    npm install
    node main.js
   ```

   Leave it running in a separate shell.

7. Build and run the frontend code:

   ```
    cd learnful/client
    npm install
    bower install
    grunt
    http-server
   ```

   You only need to rebuild if you create or delete files in `learnful/client/src`, add or remove
   Bower components, or change the environment variables above.  Otherwise, just reload the page.

Bigger heading
==============

8. Build a client distribution:

   ```
    cd learnful/client
    grunt dist
    http-server dist
   ```

   Note that anything committed to `master` is immediately deployed to production, and that you'll
   need to [sign a Contributor Licensing Agreement](https://docs.google.com/a/learnful.co/forms/d/1xJ3sa_lTyC5dzxVeIGAfGP1OBcJV1a65Tv46oK1DfWE/viewform)
   before we can accept your pull request.
