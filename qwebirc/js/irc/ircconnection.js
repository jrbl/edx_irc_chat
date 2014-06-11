/* This could do with a rewrite from scratch. */

qwebirc.irc.IRCConnection = new Class({
  Implements: [Events, Options],
  options: {
    initialNickname: "ircconnX",
    //minTimeout: 45000,
    minTimeout: 30000,
    //initialTimeout: 65000,
    //timeoutIncrement: 10000,
    timeoutIncrement: 5000,
    maxTimeout: 5 * 60000,
    //maxRetries: 5,
    maxRetries: 10,
    floodInterval: 200,
    floodMax: 10,
    floodReset: 5000,
    //errorAlert: true,
    errorAlert: false,
    serverPassword: null
  },
  initialize: function(options) {
    this.setOptions(options);
    
    this.initialNickname = this.options.initialNickname;
    
    this.counter = 0;
    this.disconnected = false;
    
    this.__floodLastRequest = 0;
    this.__floodCounter = 0;
    this.__floodLastFlood = 0;
    
    this.__retryAttempts = 0;
    
    this.__timeoutId = null;
    this.__timeout = this.options.minTimeout;
    this.__retryTimeout = this.options.timeoutIncrement;
    this.__lastActiveRequest = null;
    this.__activeRequest = null;
    
    this.__sendQueue = [];
    this.__sendQueueActive = false;
  },
  __error: function(text1, text2) {
    this.fireEvent("error", text1);
    document.getElementById("loading-pane").style.display = "block"; // GGG show loading pane
    document.getElementById("loading-error").innerHTML = "Error: " + text1 + "<br /><br />" + text2;
    if(this.options.errorAlert)
      alert(text1);
  },
  newRequest: function(url, floodProtection, synchronous) {
    if(this.disconnected)
      return null;
      
    if(floodProtection && !this.disconnected && this.__isFlooding()) {
      this.disconnect();
      this.__error("Uncontrolled flood detected -- You have been disconnected.", "Please try refreshing your browser.");
    }
    
    var asynchronous = true;
    if(synchronous)
      asynchronous = false;

    var r = new Request.JSON({
      url: qwebirc.global.dynamicBaseURL + "e/" + url + "?r=" + this.cacheAvoidance + "&t=" + this.counter++,
      async: asynchronous
    });
    
    /* try to minimise the amount of headers */
    r.headers = new Hash;
    r.addEvent("request", function() {
      var kill = ["Accept", "Accept-Language"];
      var killBit = "";

      if(Browser.Engine.trident) {
        killBit = "?";
        kill.push("User-Agent");
        kill.push("Connection");
      } else if(/Firefox[\/\s]\d+\.\d+/.test(navigator.userAgent)) { /* HACK */
        killBit = null;
      }

      for(var i=0;i<kill.length;i++) {
        try {
          this.setRequestHeader(kill[i], killBit);
        } catch(e) {
        }
      }
    }.bind(r.xhr));
    
    if(Browser.Engine.trident)
      r.setHeader("If-Modified-Since", "Sat, 1 Jan 2000 00:00:00 GMT");

    return r;
  },
  __isFlooding: function() {
    var t = new Date().getTime();
      
    if(t - this.__floodLastRequest < this.options.floodInterval) {
      if(this.__floodLastFlood != 0 && (t - this.__floodLastFlood > this.options.floodReset))
        this.__floodCounter = 0;

      this.__floodLastFlood = t;
      if(this.__floodCounter++ >= this.options.floodMax)
        return true;
    }

    this.__floodLastRequest = t;
    return false;
  },
  send: function(data, synchronous) {
    if(this.disconnected)
      return false;
    
    if(synchronous) {
      this.__send(data, false);
    } else {
      this.__sendQueue.push(data);
      this.__processSendQueue();
    }
    
    return true;
  },
  __processSendQueue: function() {
    if(this.__sendQueueActive || this.__sendQueue.length == 0)
      return;

    this.sendQueueActive = true;      
    this.__send(this.__sendQueue.shift(), true);
  },
  __send: function(data, queued) {
    var r = this.newRequest("p", false, !queued); /* !queued == synchronous */
    if(r === null)
      return;
      
    r.addEvent("complete", function(o) {
      if(queued)
        this.__sendQueueActive = false;

      if(!o || (o[0] == false)) {
        this.__sendQueue = [];
        
        if(!this.disconnected) {
          this.disconnected = true;
          this.__error("An error occured: " + o[1], "Please try refreshing your browser.");
        }
        return false;
      }
      
      this.__processSendQueue();
    }.bind(this));
    
    r.send("s=" + this.sessionid + "&c=" + encodeURIComponent(data));
  },
  __processData: function(o) {
    if(o[0] == false) {
      if(!this.disconnected) {
        this.disconnected = true;
        this.__error("Invalid session, this most likely means the server has restarted.", "Refreshing chat in 5 seconds.");
        setTimeout(window.location.href = window.location.href, this.options.timeoutIncrement); // GGG reload iframe after server is back.
      }
      return false;
    }
    
    this.__retryAttempts = 0;
    o.each(function(x) {
      this.fireEvent("recv", [x]);
    }, this);
    
    return true;
  },
  __scheduleTimeout: function() {
    this.__timeoutId = this.__timeoutEvent.delay(this.__timeout, this);
  },
  __cancelTimeout: function() {
    if($defined(this.__timeoutId)) {
      $clear(this.__timeoutId);
      this.__timeoutId = null;
    }
  },
  __timeoutEvent: function() {
    this.__timeoutId = null;
    
    if(!$defined(this.__activeRequest))
      return;
      
    if(this.__lastActiveRequest)
      this.__lastActiveRequest.cancel();
        
    this.__activeRequest.__replaced = true;
    this.__lastActiveRequest = this.__activeRequest;
    
    if(this.__timeout + this.options.timeoutIncrement <= this.options.maxTimeout) {
      this.__timeout+=this.options.timeoutIncrement;
    } else {
      this.__timeout=this.options.maxTimeout;
    }

    this.recv();
  },
  __checkRetries: function() {
    /* hmm, something went wrong! */
    if(this.__retryAttempts++ >= this.options.maxRetries && !this.disconnected) {
      this.disconnect();
      this.__error("Connection closed after several requests failed.", "Please try refreshing your browser.");
      return false;
    }
    
    document.getElementById("loading-pane").style.display = "block"; // GGG show loading pane
    document.getElementById("loading-error").innerHTML = "";
    
    //if(this.__timeout - this.options.timeoutIncrement >= this.options.minTimeout) // GGG & JRBL removed
    //  this.__timeout-=this.options.timeoutIncrement;
    this.__retryTimeout += (this.options.timeoutIncrement * this.__retryAttempts);

    return true;
  },
  recv: function() {
    var r = this.newRequest("s", true);
    if(!$defined(r))
      return;

    this.__activeRequest = r;
    r.__replaced = false;
    
    var onComplete = function(o) {
      /* if we're a replaced requests... */
      if(r.__replaced) {
        this.__lastActiveRequest = null;
        
        if(o)          
          this.__processData(o);
        return;
      }
    
      /* ok, we're the main request */
      this.__activeRequest = null;
      this.__cancelTimeout();
      
      if(!o) {
        if(this.disconnected)
          return;
          
        if(this.__checkRetries())
          this.recv.delay(this.__retryTimeout, this);
        return;
      }
      
      if(this.__processData(o))
        this.recv();
    };

    r.addEvent("complete", onComplete.bind(this));

    this.__scheduleTimeout();
    r.send("s=" + this.sessionid);
  },
  connect: function() {
    this.cacheAvoidance = qwebirc.util.randHexString(16);
    
    var r = this.newRequest("n");
    r.addEvent("complete", function(o) {
      if(!o) {
        this.disconnected = true;
        this.__error("Couldn't connect to remote server.", "Please try refreshing your browser.");
        return;
      }
      if(o[0] == false) {
        this.disconnect();
        this.__error("An error occured: " + o[1], "Please try refreshing your browser.");
        setTimeout(location.reload, this.options.timeoutIncrement);
        return;
      }
      this.sessionid = o[1];
      
      this.recv();    
    }.bind(this));
    
    var postdata = "nick=" + encodeURIComponent(this.initialNickname);
    if($defined(this.options.serverPassword))
      postdata+="&password=" + encodeURIComponent(this.options.serverPassword);
    
    r.send(postdata);
  },
  __cancelRequests: function() {
    if($defined(this.__lastActiveRequest)) {
      this.__lastActiveRequest.cancel();
      this.__lastActiveRequest = null;
    }
    if($defined(this.__activeRequest)) {
      this.__activeRequest.cancel();
      this.__activeRequest = null;
    }
  },
  disconnect: function() {
    this.disconnected = true;
    this.__cancelTimeout();
    this.__cancelRequests();
  }
});
