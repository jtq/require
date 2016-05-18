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
		var thisModuleUrl = resolvePath(baseUrl || "", modulePath);

		var cacheEntry = cache[thisModuleUrl];
		if(cacheEntry) {	// Have we heard of this module at all yet?
			if(cacheEntry.loaded || !forceCompilation) {	// If we already have a cached copy of the module, synchronously return it (for modules that use `var mod = require('mod');`)
				if(callback) {	// Equally, if the calling code has passed in a callback to be run when this module is ready, run it as well
		  			callback(cacheEntry.module);
		  		}
				return cacheEntry.module;
			}
			else {	// The module is in the process of being requested, so just add a callback
				cacheEntry.callbacks.push(callback);
			}
		}
		else {	// Brand new module (not already loaded, not already in the process of being requested)

			cacheEntry = {
				path: thisModuleUrl,
				loaded: false,
				module: {},
				callbacks: callback ? [callback] : [],
				dependencies: []
			};
			cache[thisModuleUrl] = cacheEntry;

			// If not cached then we're loading/compiling asynchronously, so get module source from remote URL:
			var req = new XMLHttpRequest();
			req.open("GET", thisModuleUrl, true);
			req.onreadystatechange = function () {

				if (req.readyState != 4 || req.status != 200) return;

		  		var source = req.responseText;

		  		// Check whether this module requires submodules, in which case compiling it will need deferring until we've downloaded/built those
		  		var matches;
		  		var requireRegexp = /[\s=;{}]require\s*\(\s*['""]\s*([a-zA-Z0-9_\-\.\/\\]+)\s*['""]/g;
		  		while((matches = requireRegexp.exec(source)) !== null) {
		  			var subModuleUrl = resolvePath(thisModuleUrl, matches[1]);
		  			cacheEntry.dependencies.push(subModuleUrl);
		  		}
		  		//console.log("loading", thisModuleUrl, "- dependencies", cacheEntry.dependencies);

		  		// No need to filter for already-cached modules here, as baseRequire() already handles that

		  		if(cacheEntry.dependencies.length) {	// If this submodule has unmet dependencies, download/build them now
			  		cacheEntry.dependencies.forEach(function(subModuleUrl) {
			  			if(cache[subModuleUrl] && hasIndirectDependencyOn(cache[subModuleUrl], thisModuleUrl)) {
			  				console.warn("circular dependency - submodule", subModuleUrl, "<- ... -> module", thisModuleUrl);
			  				console.warn("compiling ", thisModuleUrl, "with an empty", subModuleUrl);
			  				process(thisModuleUrl, source, false);
			  			}
			  			else {
				  			baseRequire(true, null, subModuleUrl, function(module) {
				  				// Now this subModule is compiled mark it off the "unmet dependencies" list
				  				//console.log("submodule", subModuleUrl, "loaded for ", thisModuleUrl);
				  				cache[subModuleUrl].loaded = true;
				  				// And if it's the last one, finally compile the original module that depended on it
				  				if(cacheEntry.dependencies.every(function(key) { return cache[key].loaded; })) {
				  					//console.log("met dependencies for", thisModuleUrl, "- building");
				  					process(thisModuleUrl, source, true);
				  				}
				  			});
				  		}
			  		});
			  	}
			  	else {	// Otherwise (no unmet dependencies), build immediately
			  		process(thisModuleUrl, source);
			  	}
			};
			req.send();
		}
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
		baseUrl = baseUrl.substr(0, baseUrl.lastIndexOf("/")+1);	// Base URL minus any trailing filename
		var denormalisedUrl = baseUrl + relativePath;
		var normalisedUrl = denormalisedUrl.replace(/([\/^])\.\//g, '$1');	// Replace "/./" and "./" with ""
		while(normalisedUrl.match(/[\/^]\.\.\//)) {
			normalisedUrl = normalisedUrl.replace(/([\/^])[^\/]+\/\.\.\/?/g, '/');	// Replace "/dir/../" and "/dir/.." with "/", or "dir/../" and "dir/.." with ""
		}
		return normalisedUrl;
	};

	var hasIndirectDependencyOn = function(module, targetPath, seen) {

		seen = seen || [];

		//console.log("checking", module.path);
		if(module.path === targetPath) {
			//console.log("found");
			return true;
		}
		else if(seen.indexOf(module.path) !== -1) {	// Encountered a recursive loop between two unrelated modules, so return false;
			//console.log("encountered unrelated loop (", module.path, " is a dependency of itself)");
			return false;
		}
		else if(module.dependencies.length === 0) {
			//console.log("no dependencies");
			return false;
		}

		seen.push(module.path);
		return module.dependencies.some(function(dep) {
			return hasIndirectDependencyOn(cache[dep], targetPath, seen);
		});
	};

	var globalRequire = baseRequire.bind(null, true, globalRootUrl);
	globalRequire.cache = cache;
	return globalRequire;
})(document.location);