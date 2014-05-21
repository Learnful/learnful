var _ = require('underscore');

var lastGraphChildKeys = {};
var updating = false;

db.child('graph').on('value', function(snapshot) {
  var oldGraph = snapshot.val();
  if (updating || _.isEqual(lastGraphChildKeys, _.pluck(oldGraph, 'childKeys'))) {
    console.log('ignoring graph update');
    return;
  }

  console.log('recomputing graph');
  var graph = {};

  function expandGraph(frameKey, parentKey, ancestorKeys) {
    console.log('expandGraph', frameKey, parentKey, ancestorKeys);
    var edges = graph[frameKey];
    if (!edges) {
      edges = graph[frameKey] = {
        childKeys: oldGraph[frameKey] && oldGraph[frameKey].childKeys, descendantKeys: {},
        parentKeys: {}, ancestorKeys: {}
      };
    }
    var recurse = false;
    if (parentKey) {
      if (!_.has(edges.parentKeys, parentKey)) {
        edges.parentKeys[parentKey] = 1;
        recurse = true;
      }
    } else {
      recurse = true;
    }
    if (!_.isEmpty(_.omit(ancestorKeys, _.keys(edges.ancestorKeys)))) {
      _.extend(edges.ancestorKeys, ancestorKeys);
      recurse = true;
    }
    if (recurse) {
      var deeperAncestorKeys = _.clone(edges.ancestorKeys);
      deeperAncestorKeys[frameKey] = 1;
      _.each(edges.childKeys, function(unused, childKey) {
        expandGraph(childKey, frameKey, deeperAncestorKeys);
      });
    }
    edges.descendantKeys = _.extend({}, edges.childKeys);
    _.each(edges.childKeys, function(value, childKey) {
      if (childKey in graph) {
        _.extend(edges.descendantKeys, graph[childKey].descendantKeys);
      }
    });
  }

  _.each(oldGraph, function(edges, frameKey) {
    expandGraph(frameKey, null, {});
  });

  console.log(graph);
  lastGraphChildKeys = _.pluck(graph, 'childKeys');
  updating = true;
  try {
    _.each(graph, function(edges, frameKey) {
      var oldEdges = oldGraph[frameKey];
      var diffEdges = {};
      _.each(['parentKeys', 'descendantKeys', 'ancestorKeys'], function(attr) {
        if (!(oldEdges ? _.isEqual(edges[attr], oldEdges[attr] || {}) : _.isEmpty(edges[attr]))) {
          diffEdges[attr] = edges[attr];
        }
      });
      if (!_.isEmpty(diffEdges)) {
        console.log('updating', frameKey);
        db.child('graph/' + frameKey).update(diffEdges);
      }
    });
  } finally {
    updating = false;
  }
});

