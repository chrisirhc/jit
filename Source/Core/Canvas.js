/*
 * File: Canvas.js
 *
 */

/*
 Class: Canvas
 
 	A canvas widget used by all visualizations. The canvas object can be accessed by doing *viz.canvas*. If you want to 
 	know more about <Canvas> options take a look at <Options.Canvas>.
 
 A canvas widget is a set of DOM elements that wrap the native canvas DOM Element providing a consistent API and behavior 
 across all browsers. It can also include Elements to add DOM (SVG or HTML) label support to all visualizations.
 
 Example:
 
 Suppose we have this HTML
 
 (start code xml)
 	<div id="infovis"></div>
 (end code)
 
 Now we create a new Visualization
 
 (start code js)
 	var viz = new $jit.Viz({
 		//Where to inject the canvas. Any div container will do.
 		'injectInto':'infovis',
		 //width and height for canvas. 
		 //Default's to the container offsetWidth and Height.
		 'width': 900,
		 'height':500
	 });
 (end code)

 The generated HTML will look like this
 
 (start code xml)
 <div id="infovis">
 	<div id="infovis-canvaswidget" style="position:relative;">
 	<canvas id="infovis-canvas" width=900 height=500
 	style="position:absolute; top:0; left:0; width:900px; height:500px;" />
 	<div id="infovis-label"
 	style="overflow:visible; position:absolute; top:0; left:0; width:900px; height:0px">
 	</div>
 	</div>
 </div>
 (end code)
 
 As you can see, the generated HTML consists of a canvas DOM Element of id *infovis-canvas* and a div label container
 of id *infovis-label*, wrapped in a main div container of id *infovis-canvaswidget*.
 */

var Canvas;
(function() {
  //check for native canvas support
  var canvasType = typeof HTMLCanvasElement,
      supportsCanvas = (canvasType == 'object' || canvasType == 'function');
  //create element function
  function $E(tag, props) {
    var elem = document.createElement(tag);
    for(var p in props) {
      if(typeof props[p] == "object") {
        $.extend(elem[p], props[p]);
      } else {
        elem[p] = props[p];
      }
    }
    if (tag == "canvas" && !supportsCanvas && G_vmlCanvasManager) {
      elem = G_vmlCanvasManager.initElement(document.body.appendChild(elem));
    }
    return elem;
  }
  //canvas widget which we will call just Canvas
  $jit.Canvas = Canvas = new Class({
    canvases: [],
    pos: false,
    element: false,
    labelContainer: false,
    translateOffsetX: 0,
    translateOffsetY: 0,
    scaleOffsetX: 1,
    scaleOffsetY: 1,
    
    initialize: function(viz, opt) {
      this.viz = viz;
      this.opt = this.config = opt;
      var id = $.type(opt.injectInto) == 'string'? 
          opt.injectInto:opt.injectInto.id,
          type = opt.type,
          idLabel = id + "-label", 
          wrapper = $(id),
          width = opt.width || wrapper.offsetWidth,
          height = opt.height || wrapper.offsetHeight,
          backgroundColor = opt.backgroundColor || wrapper.backgroundColor;
      this.id = id;
      //canvas options
      var canvasOptions = {
        injectInto: id,
        width: width,
        height: height,
        backgroundColor: backgroundColor
      };
      //create main wrapper
      this.element = $E('div', {
        'id': id + '-canvaswidget',
        'style': {
          'position': 'relative',
          'width': width + 'px',
          'height': height + 'px',
          'backgroundColor' : backgroundColor
        }
      });
      //create label container
      this.labelContainer = this.createLabelContainer(opt.Label.type, 
          idLabel, canvasOptions);
      //create primary canvas
      this.canvases.push(new Canvas.Base[type]({
        config: $.extend({idSuffix: '-canvas'}, canvasOptions),
        plot: function(base) {
          viz.fx.plot();
        },
        resize: function() {
          viz.refresh();
        }
      }));
      //create secondary canvas
      var back = opt.background;
      if(back) {
        var backCanvas = new Canvas.Background[back.type](viz, $.extend(back, canvasOptions));
        var newCanvas = new Canvas.Base[type](backCanvas);
        this.canvases.push(newCanvas);
        if(back.type == 'Circles') {
          this.circles = backCanvas;
          this.circlesCanvas = newCanvas;
        }
      }
      //insert canvases
      var len = this.canvases.length;
      while(len--) {
        this.element.appendChild(this.canvases[len].canvas);
        if(len > 0) {
          this.canvases[len].plot();
        }
      }
      this.element.appendChild(this.labelContainer);
      wrapper.appendChild(this.element);
      //Update canvas position when the page is scrolled.
      var timer = null, that = this;
      $.addEvent(window, 'scroll', function() {
        clearTimeout(timer);
        timer = setTimeout(function() {
          that.getPos(true); //update canvas position
        }, 500);
      });
    },
    /*
      Method: getCtx
      
      Returns the main canvas context object
      
      Example:
      
      (start code js)
       var ctx = canvas.getCtx();
       //Now I can use the native canvas context
       //and for example change some canvas styles
       ctx.globalAlpha = 1;
      (end code)
    */
    getCtx: function(i) {
      return this.canvases[i || 0].getCtx();
    },
    /*
      Method: getConfig
      
      Returns the current Configuration for this Canvas Widget.
      
      Example:
      
      (start code js)
       var config = canvas.getConfig();
      (end code)
    */
    getConfig: function() {
      return this.opt;
    },
    /*
      Method: getElement

      Returns the main Canvas DOM wrapper
      
      Example:
      
      (start code js)
       var wrapper = canvas.getElement();
       //Returns <div id="infovis-canvaswidget" ... >...</div> as element
      (end code)
    */
    getElement: function() {
      return this.element;
    },
    /*
      Method: getSize
      
      Returns canvas dimensions.
      
      Returns:
      
      An object with *width* and *height* properties.
      
      Example:
      (start code js)
      canvas.getSize(); //returns { width: 900, height: 500 }
      (end code)
    */
    getSize: function(i) {
      return this.canvases[i || 0].getSize();
    },
    /*
      Method: resize
      
      Resizes the canvas.
      
      Parameters:
      
      width - New canvas width.
      height - New canvas height.
      
      Example:
      
      (start code js)
       canvas.resize(width, height);
      (end code)
    
    */
    resize: function(width, height) {
      this.getPos(true);
      this.translateOffsetX = this.translateOffsetY = 0;
      this.scaleOffsetX = this.scaleOffsetY = 1;
      for(var i=0, l=this.canvases.length; i<l; i++) {
        this.canvases[i].resize(width, height);
      }
      var style = this.element.style;
      style.width = width + 'px';
      style.height = height + 'px';
      if(this.labelContainer)
        this.labelContainer.style.width = width + 'px';
    },
    /*
      Method: translate
      
      Applies a translation to the canvas.
      
      Parameters:
      
      x - (number) x offset.
      y - (number) y offset.
      disablePlot - (boolean) Default's *false*. Set this to *true* if you don't want to refresh the visualization.
      
      Example:
      
      (start code js)
       canvas.translate(30, 30);
      (end code)
    
    */
    translate: function(x, y, disablePlot) {
      this.translateOffsetX += x*this.scaleOffsetX;
      this.translateOffsetY += y*this.scaleOffsetY;
      for(var i=0, l=this.canvases.length; i<l; i++) {
        this.canvases[i].translate(x, y, disablePlot);
      }
    },
    /*
      Method: scale
      
      Scales the canvas.
      
      Parameters:
      
      x - (number) scale value.
      y - (number) scale value.
      disablePlot - (boolean) Default's *false*. Set this to *true* if you don't want to refresh the visualization.
      
      Example:
      
      (start code js)
       canvas.scale(0.5, 0.5);
      (end code)
    
    */
    scale: function(x, y, disablePlot) {
      var px = this.scaleOffsetX * x,
          py = this.scaleOffsetY * y;
      var dx = this.translateOffsetX * (x -1) / px,
          dy = this.translateOffsetY * (y -1) / py;
      this.scaleOffsetX = px;
      this.scaleOffsetY = py;
      for(var i=0, l=this.canvases.length; i<l; i++) {
        this.canvases[i].scale(x, y, true);
      }
      this.translate(dx, dy, false);
    },
    /*
      Method: getPos
      
      Returns the canvas position as an *x, y* object.
      
      Parameters:
      
      force - (boolean) Default's *false*. Set this to *true* if you want to recalculate the position without using any cache information.
      
      Returns:
      
      An object with *x* and *y* properties.
      
      Example:
      (start code js)
      canvas.getPos(true); //returns { x: 900, y: 500 }
      (end code)
    */
    getPos: function(force){
      if(force || !this.pos) {
        return this.pos = $.getPos(this.getElement());
      }
      return this.pos;
    },
    /*
       Method: clear
       
       Clears the canvas.
    */
    clear: function(i){
      this.canvases[i||0].clear();
    },
    
    path: function(type, action){
      var ctx = this.canvases[0].getCtx();
      ctx.beginPath();
      action(ctx);
      ctx[type]();
      ctx.closePath();
    },
    
    createLabelContainer: function(type, idLabel, dim) {
      var NS = 'http://www.w3.org/2000/svg';
      if(type == 'HTML' || type == 'Native') {
        return $E('div', {
          'id': idLabel,
          'style': {
            'overflow': 'visible',
            'position': 'absolute',
            'top': 0,
            'left': 0,
            'width': dim.width + 'px',
            'height': 0
          }
        });
      } else if(type == 'SVG') {
        var svgContainer = document.createElementNS(NS, 'svg:svg');
        svgContainer.setAttribute("width", dim.width);
        svgContainer.setAttribute('height', dim.height);
        var style = svgContainer.style;
        style.position = 'absolute';
        style.left = style.top = '0px';
        var labelContainer = document.createElementNS(NS, 'svg:g');
        labelContainer.setAttribute('width', dim.width);
        labelContainer.setAttribute('height', dim.height);
        labelContainer.setAttribute('x', 0);
        labelContainer.setAttribute('y', 0);
        labelContainer.setAttribute('id', idLabel);
        svgContainer.appendChild(labelContainer);
        return svgContainer;
      }
    }
  });
  //base canvas wrapper
  Canvas.Base = {};
  Canvas.Base['2D'] = new Class({
    translateOffsetX: 0,
    translateOffsetY: 0,
    scaleOffsetX: 1,
    scaleOffsetY: 1,

    initialize: function(viz) {
      this.viz = viz;
      this.opt = viz.config;
      this.size = false;
      this.createCanvas();
      this.translateToCenter();
    },
    createCanvas: function() {
      var opt = this.opt,
          width = opt.width,
          height = opt.height;
      this.canvas = $E('canvas', {
        'id': opt.injectInto + opt.idSuffix,
        'width': width,
        'height': height,
        'style': {
          'position': 'absolute',
          'top': 0,
          'left': 0,
          'width': width + 'px',
          'height': height + 'px'
        }
      });
    },
    getCtx: function() {
      if(!this.ctx) 
        return this.ctx = this.canvas.getContext('2d');
      return this.ctx;
    },
    getSize: function() {
      if(this.size) return this.size;
      var canvas = this.canvas;
      return this.size = {
        width: canvas.width,
        height: canvas.height
      };
    },
    translateToCenter: function(ps) {
      var size = this.getSize(),
          width = ps? (size.width - ps.width - this.translateOffsetX*2) : size.width;
          height = ps? (size.height - ps.height - this.translateOffsetY*2) : size.height;
      var ctx = this.getCtx();
      ps && ctx.scale(1/this.scaleOffsetX, 1/this.scaleOffsetY);
      ctx.translate(width/2, height/2);
    },
    resize: function(width, height) {
      var size = this.getSize(),
          canvas = this.canvas,
          styles = canvas.style;
      this.size = false;
      canvas.width = width;
      canvas.height = height;
      styles.width = width + "px";
      styles.height = height + "px";
      //small ExCanvas fix
      if(!supportsCanvas) {
        this.translateToCenter(size);
      } else {
        this.translateToCenter();
      }
      this.translateOffsetX =
        this.translateOffsetY = 0;
      this.scaleOffsetX = 
        this.scaleOffsetY = 1;
      this.clear();
      this.viz.resize(width, height, this);
    },
    translate: function(x, y, disablePlot) {
      var sx = this.scaleOffsetX,
          sy = this.scaleOffsetY;
      this.translateOffsetX += x*sx;
      this.translateOffsetY += y*sy;
      this.getCtx().translate(x, y);
      !disablePlot && this.plot();
    },
    scale: function(x, y, disablePlot) {
      this.scaleOffsetX *= x;
      this.scaleOffsetY *= y;
      this.getCtx().scale(x, y);
      !disablePlot && this.plot();
    },
    clear: function(){
      var size = this.getSize(),
          ox = this.translateOffsetX,
          oy = this.translateOffsetY,
          sx = this.scaleOffsetX,
          sy = this.scaleOffsetY;
      this.getCtx().clearRect((-size.width / 2 - ox) * 1/sx, 
                              (-size.height / 2 - oy) * 1/sy, 
                              size.width * 1/sx, size.height * 1/sy);
    },
    plot: function() {
      this.clear();
      this.viz.plot(this);
    }
  });
  //background canvases
  //TODO(nico): document this!
  Canvas.Background = {};
  Canvas.Background.Circles = new Class({
    initialize: function(viz, options) {
      this.viz = viz;
      this.config = $.merge({
        idSuffix: '-bkcanvas',
        levelDistance: 100,
        numberOfCircles: 6,
        CanvasStyles: {},
        offset: 0
      }, options);
      this.rings = this.resetRings();
      this.animation = new Animation;
    },
    resize: function(width, height, base) {
      this.plot(base);
    },

    'setInterval' : function(newInterval, base){
      this.config.levelDistance = newInterval;
      this.rings = this.resetRings();
      this.plot(base);
    },

    'getInterval' : function(newInterval, base){
        return this.config.levelDistance;
    },

    'plot': function(base) {
      base.clear();
      var canvas = base.canvas,
          ctx = base.getCtx(),
          conf = this.config,
          styles = conf.CanvasStyles;
      //set canvas styles
      for(var s in styles) ctx[s] = styles[s];

      for(var i = 0; i < this.rings.length; i++) {
        this.rings[i].draw(ctx);
      }
    },
    'animate' : function(base, opt) {
      this.augmentRings();

      for(var i = 0; i < this.rings.length; i++) {
         this.rings[i].compute('endRadius');
      }
      var that = this;
      this.animation.setOptions($.extend(opt, {
        $animating: false,
        compute: function(delta) {
          for(var i = 0; i < that.rings.length; i++) {
            that.rings[i].animate(delta);
          }
          that.plot(base);
//          base.plot();
          this.$animating = true;
        },
        complete: function() {
          that.pruneRings();
        }
      })).start();
    },
    resetRings: function() {
      rings = [];
      var nearTime = this.viz.config.nearTime;
      var farTime = this.viz.config.farTime;
      var timeInterval = this.config.levelDistance;
      var dist = this.viz.config.distanceFromCamera;
      var focalLen = this.viz.config.focalLength;
      var projectionPlane = nearTime + (dist - focalLen);
      var curTime = projectionPlane;

      while(curTime > farTime) {
        var ring = new Canvas.Background.Ring(this.viz, {time: curTime});
        rings.push(ring);
        curTime -= timeInterval;
      }
      return rings;
    },
    augmentRings: function() {
      var nearTime = this.viz.config.nearTime;
      var focalLen = this.viz.config.focalLength;
      var dist = this.viz.config.distanceFromCamera;
      var farTime = this.viz.config.farTime;
      var timeInterval = this.config.levelDistance;
      var firstRing = this.rings[0];
      var newRing;
      var options;
      var last = this.rings.length - 1;

      // Add rings to end
      var nextRingTime = this.rings[last].time - timeInterval;
      while(nextRingTime >= farTime) {
        options = {time: nextRingTime, state: firstRing.getState()};

        newRing = new Canvas.Background.Ring(this.viz, options);
        this.rings.push(newRing);
        nextRingTime -= timeInterval;
      }

      // Add rings to the beginning.
      var projectionPlane = nearTime + (dist - focalLen);
      var prevRingTime = this.rings[0].time + timeInterval;
      while(prevRingTime <= projectionPlane) {
        options = {time: prevRingTime, state: firstRing.getState()};

        newRing = new Canvas.Background.Ring(this.viz, options);
        this.rings.unshift(newRing);
        prevRingTime += timeInterval;
      }
    },
    pruneRings: function() {
      var nearTime = this.viz.config.nearTime;
      var farTime = this.viz.config.farTime;

      // Remove rings from end
      var last = this.rings.length - 1;
      while(this.rings[last].time < farTime && last >= 0) {
        // Remove rings at the end
        this.rings.pop();
        last = this.rings.length - 1;
      }

      // Remove rings from beginning
      while(this.rings[0].time > nearTime && this.rings.length > 0) {
        this.rings.shift();
      }

    },
    'compute' : function(property) {
      for(var i = 0; i < this.rings.length; i++) {
        this.rings[i].compute(property);
      }
    }

  });

  Canvas.Background.Ring = new Class({
    'initialize' : function(viz, options) {
      this.viz = viz;
      this.time = options.time ? options.time : ((new Date()).getTime() / 1000);
      this.state = options.state ? options.state : this.getUpdatedState();
      // start and end keep track of start state and end states of an animation.
      // They keep track of the radius.
      this.startRadius = this.calculateDistanceRadius(this.time);
      this.endRadius = this.calculateDistanceRadius(this.time);
      // current keeps track of the current state.
      this.currentRadius = this.calculateDistanceRadius(this.time);
    },
    'getState': function() {
      return this.state;
    },
    'getUpdatedState' : function() {
       return {
        nearTime: this.viz.config.nearTime,
        farTime: this.viz.config.farTime,
        f : this.viz.config.focalLength,
        radius : this.viz.config.constantR,
        dist: this.viz.config.distanceFromCamera
      }
    },
    // computers 'start', 'end', or 'current'
    // Calculates a new radius value based on the current values of nearTime, farTime etc. in EventTunnel
    'compute' : function(property) {
      this.state = this.getUpdatedState();
      this[property] = this.calculateDistanceRadius(this.time);
    },
    'calculateDistanceRadius': function(curTime){
      var nearTime = this.state.nearTime;
      var f = this.state.f;
      var r =  this.state.radius;
      var dist = this.state.dist;
      var timeDiff = nearTime - curTime + dist;
      if(timeDiff < 0) timeDiff = f / 5;
      return r / timeDiff * f;
    },
    'animate': function(delta) {
      this.currentRadius = this.findDelta(delta);

      if(delta >= 1) {
        this.startRadius = this.currentRadius;
        this.endRadius = this.currentRadius;
      }

    },
    'findDelta': function(delta) {
        return (this.endRadius - this.startRadius) * delta + this.startRadius;
    },
    'draw': function(ctx) {

      var rho = this.currentRadius;
      if(rho < 0) {
        return;
      }
      ctx.beginPath();
      ctx.arc(0, 0, rho, 0, 2 * Math.PI, false);
      ctx.stroke();
      ctx.closePath();
    }


  })
})();
