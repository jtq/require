# Require

Asynchronous/synchronous CommonJS module loader for javascript.

# Usage

## From within a web page

For a module loaded directly from your web page:

# XHR is used to asynchronously request the module file from the server
# The module source is statically analysed for sub-dependencies, and any found are themselves (recursively) asynchronously requested, analysed and built until all dependencies and subdependencies of the original module are available
# The original requested module is built
# The callback is called, and the original module is passed as a parameter

    <script src="require/index.js"></script>
    <script>
        require('modules/a.js', function(module) {
            console.log(module);  // Loaded module
            console.log(require.cache); // Cache of all modules required (including indirectly) by a.js
        });
    </script>

## From within a CommonJS module

Once all dependent modules have been analysed and loaded, the loader exposes a *synchronous* version of `require()` when building modules, that retrieves a given module from the cache and returns it synchronously to any module that requires it.

    var b = require("a.js");
    
## Additional notes

* You can inspect the module cache at any time by inspecting `require.cache`
* As per node/CommonJS expectations, recursive dependencies are resolved by substituting an empty object for the first repeated "module".  Eg, for module `A` which depends on `B` which depends on `A`, module `B` is first built with an empty object supplied for `A`, and then `A` is build with the instantiated version of `B`.
