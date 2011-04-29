/**
 *   This class was originally based on Layout.Radial.  But the layout function was completely rewritten, so it is
 *   essentially all new code.  ~80% new code.  Written by Meredith Baxter.
 */

/*
 * Class: Layouts.Tunnel
 * 
 * Implements a Tunnel Layout.
 * 
 * Implemented By:
 * 
 * <EventTunnel>
 * 
 */
Layouts.Tunnel = new Class({

  /*
   * Method: compute
   * 
   * Computes nodes' positions.
   * 
   * Parameters:
   * 
   * property - _optional_ A <Graph.Node> position property to store the new
   * positions. Possible values are 'pos', 'end' or 'start'.
   * 
   */
  compute : function(property) {
    var prop = $.splat(property || [ 'current', 'start', 'end' ]);
    NodeDim.compute(this.graph, prop, this.config);
    this.graph.computeLevels(this.root, 0, "ignore");
    var lengthFunc = this.createLevelDistanceFunc(); 
    this.computeAngularWidths(prop);
    this.computePositions(prop, lengthFunc);
  },

  /**
   * New Function.  Computes the angle spanned by a single node.  This varies depending on how far a node is
   * from the center of the event tunnel.
   * @author Baxter
   * @param node
   * @param getLength
   */
  findAngleOfNode : function(node, getLength) {
    var distance = getLength(node);
    var radius = node.getData('dim');
    var halfAngle = Math.asin(radius / distance);
    return halfAngle * 2 || 0;
  },


  /**
   * New function.  Computes the angle spanned by a node and its children.
   * @author Baxter
   * @param node
   * @param getLength
   */
  setAngleSpan : function(node, getLength) {
    var children = [];
    var that = this;
    $jit.Graph.Util.eachSubnode(node, function(node) {
      that.setAngleSpan(node, getLength);
      children.push(node);
    });

    var nodeSpan = this.findAngleOfNode(node, getLength);
    if(children.length == 0) {
      // If there are no children, angle span is zero.
      node.angleSpan = {
        begin: 0,
        end: 0
      }
    } else {
      // Otherwise, set span to accomodate span of children.

      // check if first child node overlaps node.
      var firstChild = children[0];
      var radius = node.getData('dim');
      var curNodePos = getLength(node);
      var childNodePos = getLength(firstChild);
      var nodesOverlap = Math.abs((childNodePos - curNodePos) < (radius * 2));

      // if so, shift this node over.
      if(nodesOverlap) {
        firstChild.angleSpan.begin += nodeSpan;
        firstChild.angleSpan.end += nodeSpan;
      }

      // get sum of span of children
      var spanSum = 0;
      for(var i = 0; i < children.length; i++) {
        var child = children[i];
        var childSpan = child.angleSpan.end;
        spanSum += childSpan;
      }
      // Set span of current node
      node.angleSpan = {
        begin: 0,
        end: spanSum
      }
    }

  },

  /**
   * @author Baxter
   * @param node
   * @param startAngle
   * @param endAngle
   * @param property
   * @param getLength
   * @param skipNodePlot
   */
  plotNodeAndChildren: function(node, startAngle, endAngle, property, getLength, skipNodePlot) {
    var minAngleForNode = 5 * (2 * Math.PI) / 180;
    // Plot current node.
    if(!skipNodePlot) {
      var propArray = property;
      for (var i=0; i < propArray.length; i++) {
        var pi = propArray[i];
        node.setPos($P(startAngle, getLength(node)), pi);
      }
    }

    // Next, do work required to plot children.
    var that = this;
    var totalSpan = 0;
    var numSimpleChildren= 0; // Simple subgraphs can be plotted as a line.
    var numChildren = 0;
    // Loop through each child to find out how much space each node needs.
    $jit.Graph.Util.eachSubnode(node, function(node) {
          totalSpan += node.angleSpan.end;
          if(node.angleSpan.end == 0) {
             numSimpleChildren++;
          }
          numChildren++;
     });

    if(numChildren == 0) return;
    var spaceAvailable = endAngle - startAngle;
    var leftOverSpace = spaceAvailable - totalSpan;
//    if(leftOverSpace < 0) console.log("Warning: Layouts.Tunnel.plotNodeAndChildre() - leftOverSpace < 0");
    var extraSpacePerChild = leftOverSpace / numChildren;

    var notEnoughSpace = false;
    var contraction = 0;
    if(extraSpacePerChild < minAngleForNode && numSimpleChildren > 0) {
       notEnoughSpace = true;
       var spaceForSimpleChildren = minAngleForNode * numSimpleChildren;
       contraction = leftOverSpace - spaceForSimpleChildren;
       var numComplexChildren = numChildren - numSimpleChildren;
       contraction /= (numComplexChildren || 1);
       extraSpacePerChild = 0;
    }

    var offset = 0;
    var parentIsSimple = node.angleSpan.end == 0;
    // Loop through each child of root and plot it.
    $jit.Graph.Util.eachSubnode(node, function(node) {
        var isSimpleNode = node.angleSpan.end == 0;
        var spaceNeeded = node.angleSpan.end - node.angleSpan.begin;
        var spaceAlotted = spaceNeeded + extraSpacePerChild/2 + contraction/2;
        var nodeStartAngle = offset + node.angleSpan.begin + startAngle + extraSpacePerChild/2;
        if(notEnoughSpace && isSimpleNode) {
           spaceAlotted = minAngleForNode/2;
           nodeStartAngle += minAngleForNode / 2;

        }else{
          nodeStartAngle += contraction/2;
        }
        var nodeEndAngle = nodeStartAngle + spaceAlotted;
        that.plotNodeAndChildren(node, nodeStartAngle, nodeEndAngle,property, getLength, false);
        offset = nodeEndAngle;
    });

  },

  /*
   * computePositions
   * modified by Baxter
   * Performs the main algorithm for computing node positions.
   */
  computePositions : function(property, getLength) {
    var propArray = property;
    var graph = this.graph;
    var root = graph.getNode(this.root);
    var parent = this.parent;
    var config = this.config;
    var that = this;

    for ( var i=0, l=propArray.length; i < l; i++) {
      var pi = propArray[i];
      root.setPos($P(0, 0), pi);
      root.setData('span', Math.PI * 2, pi);
    }

    root.angleSpan = {
      begin : 0,
      end : 2 * Math.PI
    };

     // Modified by Baxter
    // Loop through each child of the root and figure out how much room it needs.
    $jit.Graph.Util.eachSubnode(root, function(node) {
          that.setAngleSpan(node, getLength);
//          console.log("child node span: " + (node.angleSpan.end * 180 / (2 * Math.PI)));
     });

    this.plotNodeAndChildren(root, 0, 2 * Math.PI, propArray, getLength, true);

  },


  /*
   * Method: setAngularWidthForNodes
   * 
   * Sets nodes angular widths.
   */
  setAngularWidthForNodes : function(prop) {
    this.graph.eachBFS(this.root, function(elem, i) {
      var diamValue = elem.getData('angularWidth', prop[0]) || 5;
      elem._angularWidth = diamValue / i;
    }, "ignore");
  },

  /*
   * Method: setSubtreesAngularWidth
   * 
   * Sets subtrees angular widths.
   */
  setSubtreesAngularWidth : function() {
    var that = this;
    this.graph.eachNode(function(elem) {
      that.setSubtreeAngularWidth(elem);
    }, "ignore");
  },

  /*
   * Method: setSubtreeAngularWidth
   * 
   * Sets the angular width for a subtree.
   */
  setSubtreeAngularWidth : function(elem) {
    var that = this, nodeAW = elem._angularWidth, sumAW = 0;
    elem.eachSubnode(function(child) {
      that.setSubtreeAngularWidth(child);
      sumAW += child._treeAngularWidth;
    }, "ignore");
    elem._treeAngularWidth = Math.max(nodeAW, sumAW);
  },

  /*
   * Method: computeAngularWidths
   * 
   * Computes nodes and subtrees angular widths.
   */
  computeAngularWidths : function(prop) {
    this.setAngularWidthForNodes(prop);
    this.setSubtreesAngularWidth();
  }

});
