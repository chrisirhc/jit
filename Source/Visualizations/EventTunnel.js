/*
 * File: EventTunnel.js
 *
 */

/*
   Class: EventTunnel
   
   A radial graph visualization with advanced animations.
   
   Inspired by:
 
   Animated Exploration of Dynamic Graphs with Radial Layout (Ka-Ping Yee, Danyel Fisher, Rachna Dhamija, Marti Hearst) <http://bailando.sims.berkeley.edu/papers/infovis01.htm>
   
   Note:
   
   This visualization was built and engineered from scratch, taking only the paper as inspiration, and only shares some features with the visualization described in the paper.
   
  Implements:
  
  All <Loader> methods
  
   Constructor Options:
   
   Inherits options from
   
   - <Options.Canvas>
   - <Options.Controller>
   - <Options.Node>
   - <Options.Edge>
   - <Options.Label>
   - <Options.Events>
   - <Options.Tips>
   - <Options.NodeStyles>
   - <Options.Navigation>
   
   Additionally, there are other parameters and some default values changed
   
   interpolation - (string) Default's *linear*. Describes the way nodes are interpolated. Possible values are 'linear' and 'polar'.
   levelDistance - (number) Default's *100*. The distance between levels of the tree. 
     
   Instance Properties:

   canvas - Access a <Canvas> instance.
   graph - Access a <Graph> instance.
   op - Access a <EventTunnel.Op> instance.
   fx - Access a <EventTunnel.Plot> instance.
   labels - Access a <EventTunnel.Label> interface implementation.
*/

$jit.EventTunnel = new Class( {

  Implements: [
      Loader, Extras, Layouts.Tunnel
  ],

  initialize: function(controller){
    var $EventTunnel = $jit.EventTunnel;

    var config = {
      interpolation: 'linear',
      // might have a farTime
      // Basically, this time is the time endpoint that is on the near end of tunnel
      // Current time in seconds since 1970
      nearTime: (new Date()).getTime() / 1000,
      // Far time = 5 hours ago.
      farTime:  (new Date()).getTime() / 1000 - 5 * 60 * 60,
      // Constant used to calculate distance.
      constantR: 600,
      focalLength: 8000,
      distanceFromCamera: 0,
      minRingRadius: 25,
      maxRingRadius: 300
    };

    this.controller = this.config = $.merge(Options("Canvas", "Node", "Edge",
        "Fx", "Controller", "Tips", "NodeStyles", "Events", "Navigation", "Label"), config, controller);

    this.computeFocalLengthAndDistance();
    var canvasConfig = this.config;
    if(canvasConfig.useCanvas) {
      this.canvas = canvasConfig.useCanvas;
      this.config.labelContainer = this.canvas.id + '-label';
    } else {
      if(canvasConfig.background) {
        canvasConfig.background = $.merge({
          type: 'Circles'
        }, canvasConfig.background);
      }
      this.canvas = new Canvas(this, canvasConfig);
      this.config.labelContainer = (typeof canvasConfig.injectInto == 'string'? canvasConfig.injectInto : canvasConfig.injectInto.id) + '-label';
    }

    this.graphOptions = {
      'klass': Polar,
      'Node': {
        'selected': false,
        'exist': true,
        'drawn': true
      }
    };
    this.graph = new Graph(this.graphOptions, this.config.Node,
        this.config.Edge);
    this.labels = new $EventTunnel.Label[canvasConfig.Label.type](this);
    this.fx = new $EventTunnel.Plot(this, $EventTunnel);
    this.op = new $EventTunnel.Op(this);
    this.json = null;
    this.root = null;
    this.busy = false;
    this.parent = false;
    // initialize extras
    this.initializeExtras();
  },

  'getCanvas': function() {
    return this.canvas;
  },

  /**
   * Set the time interval represented by the space between the circles.
   * @param newInterval The interval between the circles in seconds.
   */
  'setTimeStep' : function(newInterval) {
     var circles = this.canvas.circles;
    var base = this.canvas.circlesCanvas
    circles.setTimeStep(newInterval, base);
  },

  'getTimeStep' : function() {
    var circles = this.canvas.circles;
    return circles.getTimeStep();
  },

  /**
   * Returns the time corresponding to the x,y position on the canvas.
   * @param x The x position inside the canvas where the top left corner is 0,0.
   * @param y The y position inside the canvas where the top left corner is 0,0.
   */
  'getTimeAtPosition': function(x, y) {
    var canvas = this.canvas.circlesCanvas.canvas;
    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var position = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    var radius = this.config.constantR;
    var dist = this.config.distanceFromCamera;
    var nearTime = this.config.nearTime;
    var focalL = this.config.focalLength;

    var time = nearTime + dist - focalL * radius / position;
    return time;
  },
  /* 
  
    createLevelDistanceFunc 
  
    Returns the levelDistance function used for calculating a node distance 
    to its origin. The resulting function gets the
    parent node as parameter and returns a float.

   */
  createLevelDistanceFunc: function(){
    var that = this;
    return function(elem){
      var nt = that.config.nearTime;
      var f = that.config.focalLength;
      var r = that.config.constantR;
      var dist = that.config.distanceFromCamera;
      // TODO change this to the time of the root ?
      var timeDiff = nt - elem.data.created_at.unix_timestamp + dist;
      if(timeDiff <= 0) timeDiff = f / 5;
      elem.name = timeDiff;
      return r / timeDiff * f;
    };
  },

  computeFocalLengthAndDistance: function() {
    var radius = this.config.constantR;
    var span = this.config.nearTime - this.config.farTime;
    var dist = (this.config.minRingRadius * span) / (this.config.maxRingRadius - this.config.minRingRadius);
    var focalLen = (dist * this.config.maxRingRadius) / radius;
    this.config.distanceFromCamera = dist;
    this.config.focalLength = focalLen;
  },

  /* 
     Method: refresh 
     
     Computes positions and plots the tree.

   */
  refresh: function(){
    this.compute();
    this.plot();
  },

  reposition: function(){
    this.compute('end');
  },

  /*
   Method: plot
  
   Plots the EventTunnel. This is a shortcut to *fx.plot*.
  */
  plot: function(){
    this.fx.plot();
  },
  /*
   getNodeAndParentAngle
  
   Returns the _parent_ of the given node, also calculating its angle span.
  */
  getNodeAndParentAngle: function(id){
    var theta = false;
    var n = this.graph.getNode(id);
    var ps = n.getParents();
    var p = (ps.length > 0)? ps[0] : false;
    if (p) {
      var posParent = p.pos.getc(), posChild = n.pos.getc();
      var newPos = posParent.add(posChild.scale(-1));
      theta = Math.atan2(newPos.y, newPos.x);
      if (theta < 0)
        theta += 2 * Math.PI;
    }
    return {
      parent: p,
      theta: theta
    };
  },
  /*
   tagChildren
  
   Enumerates the children in order to maintain child ordering (second constraint of the paper).
  */
  tagChildren: function(par, id){
    if (par.angleSpan) {
      var adjs = [];
      par.eachAdjacency(function(elem){
        adjs.push(elem.nodeTo);
      }, "ignore");
      var len = adjs.length;
      for ( var i = 0; i < len && id != adjs[i].id; i++)
        ;
      for ( var j = (i + 1) % len, k = 0; id != adjs[j].id; j = (j + 1) % len) {
        adjs[j].dist = k++;
      }
    }
  },
  /* 
  Method: onClick 
  
  Animates the <EventTunnel> to center the node specified by *id*.

   Parameters:

   id - A <Graph.Node> id.
   opt - (optional|object) An object containing some extra properties described below
   hideLabels - (boolean) Default's *true*. Hide labels when performing the animation.
  */
  onClick: function(id, opt){
    var canvas = this.canvas.circlesCanvas.canvas;
    var canvasX = canvas.offsetLeft;
    var canvasY = canvas.offsetTop;
    var x = opt.x - canvasX;
    var y = opt.y - canvasY;
    var computedTime = this.getTimeAtPosition(x,y);

    console.log("id:" + id);
    console.log("timestamp: " + opt.time);
    console.log("computed Time: " + computedTime);
    console.log("");

  }
});

$jit.EventTunnel.$extend = true;

(function(EventTunnel){

  /*
     Class: EventTunnel.Op
     
     Custom extension of <Graph.Op>.

     Extends:

     All <Graph.Op> methods
     
     See also:
     
     <Graph.Op>

  */
  EventTunnel.Op = new Class( {

    Implements: Graph.Op

  });

  /*
     Class: EventTunnel.Plot
    
    Custom extension of <Graph.Plot>.
  
    Extends:
  
    All <Graph.Plot> methods
    
    See also:
    
    <Graph.Plot>
  
  */
  EventTunnel.Plot = new Class( {

    Implements: Graph.Plot,

    animateTime: function(nearTime, farTime, opt, versor) {
      this.viz.config.farTime = farTime;
      this.viz.config.nearTime = nearTime;
      this.viz.computeFocalLengthAndDistance();
      this.viz.compute('end');
      var circles = this.viz.canvas.circles;
      opt = $.merge({clearCanvas: true},opt);
      this.animate(opt, versor);
      circles.animate(this.viz.canvas.circlesCanvas, opt);
    },

    animate: function(opt, versor) {
      opt = $.merge(this.viz.config, opt || {});
      var that = this,
          viz = this.viz,
          graph  = viz.graph,
          interp = this.Interpolator,
          animation =  opt.type === 'nodefx'? this.nodeFxAnimation : this.animation;
      //prepare graph values
      var m = this.prepare(opt.modes);

      //animate
      if(opt.hideLabels) this.labels.hideLabels(true);
      animation.setOptions($.extend(opt, {
        $animating: false,
        compute: function(delta) {
          graph.eachNode(function(node) {
            node.$animating = true;
            for(var p in m) {
              interp[p](node, m[p], delta, versor);
            }
            var newPosC = node.pos.getc();
            var newPosP = node.pos.getp();
            var rho = newPosP.rho;
            var nodeVisible = Math.abs(newPosC.x)<= viz.config.maxRingRadius && Math.abs(newPosC.y) <= viz.config.maxRingRadius
                && rho >= viz.config.minRingRadius;
            if(!nodeVisible) {
              // Object has moved outside of scope.
              // So make invisible.
              if(node.data.$alpha != 0 && rho != 0) {
                  that.animateAlpha(node, 0);
//                node.data.$alpha = 0;
              } else if(rho == 0) {
                // The root faux node.
                node.data.$alpha = 0;
                node.faux = true;
              }
            } else if(node.data.$alpha != 1){
              // if node is inside range, make sure it is visible.
//              node.data.$alpha = 1;
              that.animateAlpha(node, 1);
            }
          });
          that.plot(opt, this.$animating, delta);
          this.$animating = true;
        },

        complete: function() {
          graph.eachNode(function(node) {
            node.$animating = false;
          });
          if(opt.hideLabels) that.labels.hideLabels(false);
          that.plot(opt);
          var finishPlotting;
          var startTime = (new Date()).getTime();
          finishPlotting = setInterval(function(){
            if((new Date()).getTime() - startTime >= 500){
              clearInterval(finishPlotting);
            }
            that.plot(opt);
          }, 33);
          opt.onComplete();
          opt.onAfterCompute();
        }
      })).start();
    },

    animateAlpha: function(node, alphaVal) {
      opt = {duration: 500, $animating: false, clearCanvas: true};
      var that = this;
      var alphaAnim = new Animation;
      node.setData('alpha', alphaVal, 'end');
      alphaAnim.setOptions({
        duration: 500,
        clearCanvas: false,
        compute: function(delta) {
          that.Interpolator.number(node, 'alpha', delta, 'getData', 'setData');
        }
      }).start();
    },

    plotLine: function(adj, canvas, animating) {
      var f = adj.getData('type'),
          ctxObj = this.edge.CanvasStyles;
      if(f != 'none') {
        var width = adj.getData('lineWidth'),
            color = adj.getData('color'),
            ctx = canvas.getCtx(),
            nodeFrom = adj.nodeFrom,
            nodeTo = adj.nodeTo;

        ctx.save();
        ctx.lineWidth = width;
        ctx.fillStyle = ctx.strokeStyle = color;

        var min = Math.min(nodeFrom.getData('alpha'),nodeTo.getData('alpha'));
        var max = Math.max(nodeFrom.getData('alpha'),nodeTo.getData('alpha'));
        ctx.globalAlpha = 1;

        if(max < 1 || min < 1) {
          var avg = (max + min) / 2;
          ctx.globalAlpha = avg * avg;
        }

        // Look to see if any of the nodes are positioned at 0,0.
        // If so, we're dealing with the root node, don't draw a line.
        var nodeFromRho = nodeFrom.pos.getp().rho;
        var nodeToRho = nodeTo.pos.getp().rho;
        if(nodeFromRho == 0 || nodeToRho == 0) {
          ctx.globalAlpha = 0;
        }

        for(var s in ctxObj) {
          ctx[s] = adj.getCanvasStyle(s);
        }

        this.edgeTypes[f].render.call(this, adj, canvas, animating);
        ctx.restore();
      }
    }

  });

  /*
    Object: EventTunnel.Label

    Custom extension of <Graph.Label>. 
    Contains custom <Graph.Label.SVG>, <Graph.Label.HTML> and <Graph.Label.Native> extensions.
  
    Extends:
  
    All <Graph.Label> methods and subclasses.
  
    See also:
  
    <Graph.Label>, <Graph.Label.Native>, <Graph.Label.HTML>, <Graph.Label.SVG>.
  
   */
  EventTunnel.Label = {};

  /*
     EventTunnel.Label.Native

     Custom extension of <Graph.Label.Native>.

     Extends:

     All <Graph.Label.Native> methods

     See also:

     <Graph.Label.Native>

  */
  EventTunnel.Label.Native = new Class( {
    Implements: Graph.Label.Native
  });

  /*
     EventTunnel.Label.SVG
    
    Custom extension of <Graph.Label.SVG>.
  
    Extends:
  
    All <Graph.Label.SVG> methods
  
    See also:
  
    <Graph.Label.SVG>
  
  */
  EventTunnel.Label.SVG = new Class( {
    Implements: Graph.Label.SVG,

    initialize: function(viz){
      this.viz = viz;
    },

    /* 
       placeLabel

       Overrides abstract method placeLabel in <Graph.Plot>.

       Parameters:

       tag - A DOM label element.
       node - A <Graph.Node>.
       controller - A configuration/controller object passed to the visualization.
      
     */
    placeLabel: function(tag, node, controller){
      var pos = node.pos.getc(true), 
          canvas = this.viz.canvas,
          ox = canvas.translateOffsetX,
          oy = canvas.translateOffsetY,
          sx = canvas.scaleOffsetX,
          sy = canvas.scaleOffsetY,
          radius = canvas.getSize();
      var labelPos = {
        x: Math.round(pos.x * sx + ox + radius.width / 2),
        y: Math.round(pos.y * sy + oy + radius.height / 2)
      };
      tag.setAttribute('x', labelPos.x);
      tag.setAttribute('y', labelPos.y);

      controller.onPlaceLabel(tag, node);
    }
  });

  /*
     EventTunnel.Label.HTML

     Custom extension of <Graph.Label.HTML>.

     Extends:

     All <Graph.Label.HTML> methods.

     See also:

     <Graph.Label.HTML>

  */
  EventTunnel.Label.HTML = new Class( {
    Implements: Graph.Label.HTML,

    initialize: function(viz){
      this.viz = viz;
    },
    /* 
       placeLabel

       Overrides abstract method placeLabel in <Graph.Plot>.

       Parameters:

       tag - A DOM label element.
       node - A <Graph.Node>.
       controller - A configuration/controller object passed to the visualization.
      
     */
    placeLabel: function(tag, node, controller){
      var pos = node.pos.getc(true), 
          canvas = this.viz.canvas,
          ox = canvas.translateOffsetX,
          oy = canvas.translateOffsetY,
          sx = canvas.scaleOffsetX,
          sy = canvas.scaleOffsetY,
          radius = canvas.getSize();
      var labelPos = {
        x: Math.round(pos.x * sx + ox + radius.width / 2),
        y: Math.round(pos.y * sy + oy + radius.height / 2)
      };

      var style = tag.style;
      style.left = labelPos.x + 'px';
      style.top = labelPos.y + 'px';
      style.display = this.fitsInCanvas(labelPos, canvas)? '' : 'none';

      controller.onPlaceLabel(tag, node);
    }
  });

  /*
    Class: EventTunnel.Plot.NodeTypes

    This class contains a list of <Graph.Node> built-in types. 
    Node types implemented are 'none', 'circle', 'triangle', 'rectangle', 'star', 'ellipse' and 'square'.

    You can add your custom node types, customizing your visualization to the extreme.

    Example:

    (start code js)
      EventTunnel.Plot.NodeTypes.implement({
        'mySpecialType': {
          'render': function(node, canvas) {
            //print your custom node to canvas
          },
          //optional
          'contains': function(node, pos) {
            //return true if pos is inside the node or false otherwise
          }
        }
      });
    (end code)

  */
  EventTunnel.Plot.NodeTypes = new Class({
    'none': {
      'render': $.empty,
      'contains': $.lambda(false)
    },
    'circle': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true), 
            dim = node.getData('dim');
        this.nodeHelper.circle.render('fill', pos, dim, canvas);
      },
      'contains': function(node, pos){
        var npos = node.pos.getc(true), 
            dim = node.getData('dim');
        return this.nodeHelper.circle.contains(npos, pos, dim);
      }
    },
    'ellipse': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true), 
            width = node.getData('width'), 
            height = node.getData('height');
        this.nodeHelper.ellipse.render('fill', pos, width, height, canvas);
        },
      'contains': function(node, pos){
        var npos = node.pos.getc(true), 
            width = node.getData('width'), 
            height = node.getData('height');
        return this.nodeHelper.ellipse.contains(npos, pos, width, height);
      }
    },
    'square': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true), 
            dim = node.getData('dim');
        this.nodeHelper.square.render('fill', pos, dim, canvas);
      },
      'contains': function(node, pos){
        var npos = node.pos.getc(true), 
            dim = node.getData('dim');
        return this.nodeHelper.square.contains(npos, pos, dim);
      }
    },
    'rectangle': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true), 
            width = node.getData('width'), 
            height = node.getData('height');
        this.nodeHelper.rectangle.render('fill', pos, width, height, canvas);
      },
      'contains': function(node, pos){
        var npos = node.pos.getc(true), 
            width = node.getData('width'), 
            height = node.getData('height');
        return this.nodeHelper.rectangle.contains(npos, pos, width, height);
      }
    },
    'triangle': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true), 
            dim = node.getData('dim');
        this.nodeHelper.triangle.render('fill', pos, dim, canvas);
      },
      'contains': function(node, pos) {
        var npos = node.pos.getc(true), 
            dim = node.getData('dim');
        return this.nodeHelper.triangle.contains(npos, pos, dim);
      }
    },
    'star': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true),
            dim = node.getData('dim');
        this.nodeHelper.star.render('fill', pos, dim, canvas);
      },
      'contains': function(node, pos) {
        var npos = node.pos.getc(true),
            dim = node.getData('dim');
        return this.nodeHelper.star.contains(npos, pos, dim);
      }
    },
    
    'reply': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true),
            dim = node.getData('dim');

        this.nodeHelper.circle.render('fill', pos, dim, canvas);
      },
      'contains': function(node, pos){
        var npos = node.pos.getc(true),
            dim = node.getData('dim');
        return this.nodeHelper.circle.contains(npos, pos, dim);
      }
    },
    
    'retweet': {
      'render': function(node, canvas){
        var pos = node.pos.getc(true),
            dim = node.getData('dim'),
            color = node.getData('color'),
            fillColor = this.colorHelper.avgColor(color, 0xFFFFFF),
            strokeColor = this.colorHelper.avgColor(color, 0xbbbbbb),
            lineWidth = node.getData('lineWidth');

        fillColor = this.colorHelper.avgColor(fillColor, 0xFFFFFF);

        this.colorHelper.setColor(strokeColor, 'strokeStyle', canvas);
        this.colorHelper.setColor(fillColor, 'fillStyle', canvas);
        this.colorHelper.setLineWidth(lineWidth, canvas);
        this.nodeHelper.circle.render('fill', pos, dim, canvas);
        this.nodeHelper.circle.render('stroke', pos, dim, canvas);



      },
      'contains': function(node, pos){
        var npos = node.pos.getc(true),
            dim = node.getData('dim');

        return this.nodeHelper.circle.contains(npos, pos, dim);
      }
    }
  });

  /*
    Class: EventTunnel.Plot.EdgeTypes

    This class contains a list of <Graph.Adjacence> built-in types. 
    Edge types implemented are 'none', 'line' and 'arrow'.
  
    You can add your custom edge types, customizing your visualization to the extreme.
  
    Example:
  
    (start code js)
      EventTunnel.Plot.EdgeTypes.implement({
        'mySpecialType': {
          'render': function(adj, canvas) {
            //print your custom edge to canvas
          },
          //optional
          'contains': function(adj, pos) {
            //return true if pos is inside the arc or false otherwise
          }
        }
      });
    (end code)
  
  */
  EventTunnel.Plot.EdgeTypes = new Class({
    'none': $.empty,
    'line': {
      'render': function(adj, canvas) {
        var from = adj.nodeFrom.pos.getc(true),
            to = adj.nodeTo.pos.getc(true);
        this.edgeHelper.line.render(from, to, canvas);
      },
      'contains': function(adj, pos) {
        var from = adj.nodeFrom.pos.getc(true),
            to = adj.nodeTo.pos.getc(true);
        return this.edgeHelper.line.contains(from, to, pos, this.edge.epsilon);
      }
    },
    'retweet': {
      'render': function(adj, canvas) {
        var from = adj.nodeFrom.pos.getc(true),
            to = adj.nodeTo.pos.getc(true),
            color = adj.nodeTo.getData('color'),
            newColor = this.colorHelper.avgColor(color, 0xbbbbbb);

        this.colorHelper.setColor(newColor, 'strokeStyle', canvas);
        this.edgeHelper.line.render(from, to, canvas);
      },
      'contains': function(adj, pos) {
        var from = adj.nodeFrom.pos.getc(true),
            to = adj.nodeTo.pos.getc(true);
        return this.edgeHelper.line.contains(from, to, pos, this.edge.epsilon);
      }
    },
    'arrow': {
      'render': function(adj, canvas) {
        var from = adj.nodeFrom.pos.getc(true),
            to = adj.nodeTo.pos.getc(true),
            dim = adj.getData('dim'),
            direction = adj.data.$direction,
            inv = (direction && direction.length>1 && direction[0] != adj.nodeFrom.id);
        this.edgeHelper.arrow.render(from, to, dim, inv, canvas);
      },
      'contains': function(adj, pos) {
        var from = adj.nodeFrom.pos.getc(true),
            to = adj.nodeTo.pos.getc(true);
        return this.edgeHelper.arrow.contains(from, to, pos, this.edge.epsilon);
      }
    }
  });

})($jit.EventTunnel);
