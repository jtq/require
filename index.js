var require = (function(globalRootUrl) {

	globalRootUrl = globalRootUrl + "";

	var cache = {};

	/**
	 * @param {boolean} forceCompilation - Force compilation of required() modules? (Should always be true except when resolving recursive dependencies)
	 * @param {string} baseUrl - Absolute URL to resolve modulePath against
	 * @param {string} modulePath - Module path/URL (may be absolute or relative to baseUrl)
	 * @param {callback} callback - Callback when module is successfully loaded
	 */
	var baseRequire = function(forceCompilation, baseUrl, modulePath, callback) {
		// Convert relative module path to absolute and normalise to get rid of any ./ or ../

		//console.log("required", modulePath, "from", baseUrl);

		var thisModuleUrl = resolvePath(baseUrl || "", modulePath);
		var thisCanonicalName = canonicalName(thisModuleUrl);

		//console.log(" -> canonical name", thisCanonicalName);

		var cacheEntry = cache[thisCanonicalName];
		if(cacheEntry) {	// Have we heard of this module at all yet?
			//console.log("found cache entry for", thisCanonicalName, ":", cacheEntry);
			if(cacheEntry.loaded || !forceCompilation) {	// If we already have a cached copy of the module, synchronously return it (for modules that use `var mod = require('mod');`)
				//console.log(" -> and loaded, so returning module & calling any callbacks");
				if(callback) {	// Equally, if the calling code has passed in a callback to be run when this module is ready, run it as well
		  			callback(cacheEntry.module);
		  		}
				return cacheEntry.module;
			}
			else if(cacheEntry.aliases.indexOf(thisModuleUrl) !== -1) {	// The module is in the process of being requested by this URL, so just add a callback
				//console.log(" -> already looking for module at this URL (", thisModuleUrl, "), so just add callback");
				if(callback) {
					cacheEntry.callbacks.push(callback);
				}
				return;
			}
		}
		else {	// Brand new module (not already loaded, not already in the process of being requested)

			cacheEntry = {
				name: thisCanonicalName,
				aliases: [],
				loaded: false,
				module: {},
				callbacks: callback ? [callback] : [],
				dependencies: []
			};
			cache[thisCanonicalName] = cacheEntry;
			//console.log("created new cache entry for", thisCanonicalName, ":", cacheEntry);
		}

		// We're requesting the module by an alias that it hasn't been asked for by yet, so make the request
		cacheEntry.aliases.push(thisModuleUrl);

		//console.log("requesting", thisModuleUrl);

		// If not cached then we're loading/compiling asynchronously, so get module source from remote URL:
		var req = new XMLHttpRequest();
		req.open("GET", thisModuleUrl, true);
		req.onreadystatechange = function () {

			if(req.readyState === XMLHttpRequest.HEADERS_RECEIVED && req.status === 404) {	// Couldn't find a module at this URL
				//console.log("module 404ed at", thisModuleUrl);
				req.abort();
				if(thisModuleUrl.match(/\.js$/) && !thisModuleUrl.match(/\/index.js$/)) {
					// We looked for a.js, so let's try looking for a/index.js instead

					var revisedModuleUrl = thisModuleUrl.replace(/\.js$/, "/index.js");
					//console.log("retrying at", revisedModuleUrl);
					baseRequire(true, null, revisedModuleUrl);
					return;
				}
			}

			if (req.readyState !== XMLHttpRequest.DONE || req.status !== 200) return;

			//console.log("found module at", thisModuleUrl);
			cache[thisCanonicalName].canonicalUrl = thisModuleUrl;

	  		var source = req.responseText;

	  		// Check whether this module requires submodules, in which case compiling it will need deferring until we've downloaded/built those
	  		var matches;
	  		var requireRegexp = /[\s=;{}]require\s*\(\s*['""]\s*([a-zA-Z0-9_@\-\.\/\\]+)\s*['""]/g;
	  		while((matches = requireRegexp.exec(source)) !== null) {
	  			var subModuleUrl = resolvePath(thisModuleUrl, matches[1]);
	  			var subModuleCanonicalUrl = canonicalName(subModuleUrl);
	  			cacheEntry.dependencies.push(subModuleCanonicalUrl);
	  		}
	  		//console.log("loading", thisModuleUrl, "- dependencies", cacheEntry.dependencies);

	  		// No need to filter for already-cached modules here, as baseRequire() already handles that

	  		if(cacheEntry.dependencies.length) {	// If this submodule has unmet dependencies, download/build them now
		  		cacheEntry.dependencies.forEach(function(subModuleName) {
		  			if(cache[subModuleName] && hasIndirectDependencyOn(cache[subModuleName], thisCanonicalName)) {
		  				console.warn("circular dependency - submodule", subModuleName, "<- ... -> module", thisCanonicalName);
		  				console.warn("compiling ", thisCanonicalName, "with an empty", subModuleName);
		  				process(thisCanonicalName, source, false);
		  			}
		  			else {
			  			baseRequire(true, null, subModuleName, function(module) {
			  				// Now this subModule is compiled mark it off the "unmet dependencies" list
			  				//console.log("submodule", subModuleName, "loaded for ", thisCanonicalName);
			  				cache[subModuleName].loaded = true;
			  				// And if it's the last one, finally compile the original module that depended on it
			  				if(cacheEntry.dependencies.every(function(key) { return cache[key].loaded; })) {
			  					//console.log("met dependencies for", thisModuleUrl, "- building");
			  					process(thisCanonicalName, source, true);
			  				}
			  			});
			  		}
		  		});
		  	}
		  	else {	// Otherwise (no unmet dependencies), build immediately
		  		process(thisCanonicalName, source);
		  	}
		};
		req.send();
		
	};

	var compile = function(source, thisModuleUrl, forceCompilation) {	// Create new scope for eval

		var require = baseRequire.bind(null, forceCompilation, thisModuleUrl);
		var module = {
			exports: {}
		};
		var exports = module.exports;	/// Handle exports= and module.exports=

		eval(source);

		return module.exports;
	};

	var process = function(thisModuleUrl, source, forceCompilation) {
		// Finally compile the source of our module now all the dependencies have been compiled
		//console.log("compiling", thisModuleUrl);
  		var module = compile(source, thisModuleUrl, forceCompilation);
  		//console.log("compiled", thisModuleUrl, module);

  		cache[thisModuleUrl].module = module;
  		cache[thisModuleUrl].loaded = forceCompilation;

  		cache[thisModuleUrl].callbacks.forEach(function(callback) {
  			callback(module);
  		});
	};

	var resolvePath = function(baseUrl, relativePath) {
		var denormalisedUrl = relativePath;

		if(!relativePath.match(/^[a-z][a-z0-9+\-\.]*:/i)) {	// If relativePath is an absolute URL, just use that
			if(relativePath[0] !== ".") {				// "module" => "node_modules/module"
				var pos = baseUrl.indexOf("/node_modules/");
				if(pos !== -1) {
					baseUrl = baseUrl.substr(0, pos + 14);
				}
				else {
					denormalisedUrl = "node_modules/" + denormalisedUrl;
				}
			}
			baseUrl = baseUrl.substr(0, baseUrl.lastIndexOf("/")+1);	// Base URL minus any trailing filename
			denormalisedUrl = baseUrl + denormalisedUrl;
		}
		var normalisedUrl = denormalisedUrl.replace(/([\/^])\.\//g, '$1');	// Replace "/./"s and "./"s with ""
		while(normalisedUrl.match(/[\/^]\.\.\//)) {
			normalisedUrl = normalisedUrl.replace(/([\/^])[^\/]+\/\.\.\/?/g, '/');	// Replace "/dir/../" and "/dir/.." with "/", or "dir/../" and "dir/.." with ""
		}

		if(!normalisedUrl.match(/\.js$/)) {
			if(normalisedUrl.substr(-1) === "/") {
				normalisedUrl += "index.js";
			}
			else {
				normalisedUrl += ".js";
			}
			
		}

		return normalisedUrl;
	};

	var canonicalName = function(absolutePath) {

		var canonicalName = absolutePath;

//		if(!canonicalName.match(/^[a-z][a-z0-9+\-\.]*:/i)) {	// If absolutePath is an absolute URL, just use that
			if(canonicalName.match(/\.js$/)) {
				canonicalName = canonicalName.substr(0, canonicalName.length-3);
			}
			if(canonicalName.match(/\/index$/)) {
				canonicalName = canonicalName.substr(0, canonicalName.length-5);
			}
			if(canonicalName.match(/\/$/)) {
				canonicalName = canonicalName.substr(0, canonicalName.length-1);
			}
//		}
		return canonicalName;
	}

	var hasIndirectDependencyOn = function(module, targetPath, seen) {

		seen = seen || [];

		//console.log("checking", module.name, "for dependency on", targetPath);
		if(module.name === targetPath) {
			//console.log(" -> found");
			return true;
		}
		else if(seen.indexOf(module.name) !== -1) {	// Encountered a recursive loop between two unrelated modules, so return false;
			//console.log(" -> encountered unrelated loop (", module.name, " is a dependency of itself)");
			return false;
		}
		else if(module.dependencies.length === 0) {
			//console.log(" -> no dependencies");
			return false;
		}

		seen.push(module.name);
		return module.dependencies.some(function(dep) {
			return hasIndirectDependencyOn(cache[dep], targetPath, seen);
		});
	};

	// Now generate a global require function:
	// * Bound to the document location as a basePath
	// * Which accepts a single module path of array of module paths (for convenience)
	// * Which accepts a callback that's not fired until *all* the module(s) have finished loading
	var documentLocationRequire = baseRequire.bind(null, true, globalRootUrl);
	var globalRequire = function(modulePaths, callback) {

		// If single value passed, coerce it to an array
		modulePaths = modulePaths instanceof Array ? modulePaths : [modulePaths];

		// Resolve module paths to absolute paths
		var canonicalModulePaths = modulePaths.map(function(modulePath) {
			return canonicalName(resolvePath(globalRootUrl, modulePath));
		});

		// Now require (async) each module in turn, and if a callback was provided by the caling code, pass
		// in a callback that waits for *all* modules to be loaded before firing the provided callback.
		var loadedModules = 0;
		var allLoadedCallback = function() {
			loadedModules++;

			if(loadedModules === modulePaths.length) {
				var modules = canonicalModulePaths.map(function(modulePath) { return cache[modulePath].module; });
				callback.apply(null, modules);
			}
		};

		modulePaths.forEach(function(relativeModulePath) {
			documentLocationRequire(relativeModulePath, (callback ? allLoadedCallback : null));
		});

	};
	globalRequire.cache = cache;

	return globalRequire;
})(document.location);