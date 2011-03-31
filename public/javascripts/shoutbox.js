var shoutboxClient, layout;

function ShoutboxClient() {
  var self = this;

  this.init = function(){
    self.setupBayeuxClient();
    self.loadEntries();
    setInterval(function() {
      self.checkStatus();
    }, 1 * 1000);
  };

	this.ShoutboxAuth = {
	  outgoing: function(message, callback) {
		  if (message.channel == "/meta/subscribe") {
			  if (!message.ext) message.ext = {};
			  message.ext.authToken = self.authToken;
			}
	    callback(message);
	  }
	};

  this.setupBayeuxClient = function() {
    var that = this;
    self.client = new Faye.Client(location.protocol + '//' + location.host + '/bayeux', { timeout: 180 });
		self.client.addExtension(that.ShoutboxAuth);
    self.client.subscribe('/status/' + that.accountName, function(updateData) {
      console.log(updateData);
      if (updateData.remove) {
        self.removeEntry({ slug: updateData.remove });
      }
      else {
        var el = self.findEntry(updateData);
        el.removeClass();
        el.attr('data-updated-at', updateData.updated_at);
        el.attr('data-expires-at', updateData.expires_at);
        el.addClass(updateData.status);
        el.addClass('fresh');
        el.find('.info').html(updateData.message);
        layout.show(indexByGroup(updateData.group));
      }
      self.checkStatus();
    });
  };

  this.checkStatus = function() {
    $('li[data-updated-at]').each(function() {
      var el         = $(this),
          lastUpdate = parseInt(el.attr('data-updated-at')) * 1000,
          expiresAt  = parseInt(el.attr('data-expires-at')) * 1000,
          now        = (new Date()).getTime();
      if (lastUpdate + 30000 < now) {
        el.removeClass('fresh');
      }
      if (expiresAt < now) {
        el.addClass('offline');
      }
    });
    this.colorizesNav();
  };

  this.loadEntries = function() {
    $.ajax({
      url: '/data',
      dataType: 'json',
      success: function(data, status, req) {
        self.authToken   = req.getResponseHeader('X-Shoutbox-Auth-Token');
        self.accountName = req.getResponseHeader('X-Shoutbox-Account-Name');
        _(data).forEach(function(entries, group) {
          _(entries).forEach(function(entry, name) {
            self.addEntry(_(entry).extend({ name: name, group: group }));
          });
        });
        self.colorizesNav();
        self.setupBayeuxClient(); // we need authToken and accountName
      },
      error: function(response) {
        if (response.status == 401) {
          location.href = '/index.html?flash_error=You need to lo log in.'
        }
      }
    });
  };

  this.addGroup = function(data) {
    $('#groups').append($.mustache($('#group-template').html(), data));
    $('#group-titles').append($.mustache($('#group-title-template').html(), data));
    return $('#groups [data-group-id="' + data.group + '"]');
  };

  this.findGroup = function(data) {
    var el = $('#groups [data-group-id="' + data.group + '"]');
    if (el.length == 0) {
      el = this.addGroup(data);
    }
    return el;
  };

  this.addEntry = function(data) {
    this.findGroup(data).find('ul').append($.mustache($('#entry-template').html(), data));
    return $('[data-entry-id="' + data.slug + '"]');
  };

  this.findEntry = function(data) {
    var el = $('[data-entry-id="' + data.slug + '"]');
    if (el.length == 0) {
      el = this.addEntry(data);
    }
    return el;
  };

  this.colorizesNav = function() {
    _($('#group-titles > a')).each(function(el) {
      var el = $(el),
          groupEl = $('#groups > li[data-group-id="' + el.attr('data-group-id') + '"]');
      if (groupEl.find('.red').length) {
        el.removeClass('green yellow').addClass('red');
      }
      else if (groupEl.find('.yellow').length) {
        el.removeClass('green red').addClass('yellow');
      }
      else {
        el.removeClass('yellow red').addClass('green');
      }
    });
  }

  this.init();
}

jQuery(function() {
  shoutboxClient = new ShoutboxClient();
});

var indexByGroup = function(group) {
  return _($('#groups > li')).chain().map(function(el) {
    return $(el).attr('data-group-id');
  }).indexOf(group).value();
}

$(function() {
  function checkStatus() {
    $('li[data-updated-at]').each(function(){
      lastUpdate = $(this).attr('data-updated-at');
      if ((parseInt(lastUpdate) + 1 * 60 * 1000) < (new Date().getTime()) ) {
        $(this).removeClass('fresh');
      }
    });
  }

  function markOffline() {
    $('li[data-expires-at]').each(function(){
	    expiresAt = $(this).attr('data-expires-at');
      if ((parseInt(expiresAt) * 1000) < (new Date().getTime()) ) {
        $(this).addClass('offline');
      }
	  });
  }

  setInterval(function () {
    checkStatus();
    markOffline();
  }, 10 * 1000);

  var configDialog = function() {
    var el = $('#config');
    if (el.length == 0) {
      $('body').append($.mustache($('#config-template').html(), {
        host: location.hostname,
        port: location.port,
        auth_token: shoutboxClient.authToken
      }));
      el = $('#config');
      el.find('[data-action="close-config"]').click(function() {
        el.fadeOut();
      });
      $('body').keydown(function(event) {
        if (event.which == 27 /* ESC */) {
          el.fadeOut();
          layout._zoomed = true; // prevent zooming
        }
      });
    }
    return el;
  }

  $('[data-action="config"]').click(function() {
    configDialog().fadeIn();
  });

  $('#groups').delegate('[data-action="activate-info"]', 'click', function() {
    $(this).parents('li').toggleClass('info-activated');
  });

  $('[data-action="list"]').click(function() {
    $(this).siblings().removeClass('active');
    $(this).addClass('active');
    layout.setLayout('list');
  });
  $('[data-action="spaces"]').click(function() {
    $(this).siblings().removeClass('active');
    $(this).addClass('active');
    layout.setLayout('spaces');
  });

  $(window).load(function() {
    layout = $('#groups').layout({
      marginTop: 80,
      showCallback: function(index) {
        $('#group-titles > a').removeClass('selected').eq(index).addClass('selected');
      }
    }).data('layout');
    layout.setLayout('spaces');
  });

  $('#group-titles').delegate('a', 'click', function() {
    var index = _($('#groups > li')).chain().map(function(group) {
      return $(group).attr('data-group-id');
    }).indexOf($(this).attr('data-group-id')).value();
    layout.show(index);
    return false;
  });
});


