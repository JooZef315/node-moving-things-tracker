const itemTrackedModule = require("./ItemTracked");
var ItemTracked = itemTrackedModule.ItemTracked;
var kdTree = require("./lib/kdTree-min.js").kdTree;
var isEqual = require("lodash.isequal");
var iouAreas = require("./utils").iouAreas;
var munkres = require("munkres-js");

class Tracker {
  constructor() {
    this.DEBUG_MODE = false;
    this.idDisplay = 0;
    this.mapOfItemsTracked = new Map();
    this.mapOfAllItemsTracked = new Map();
    this.keepAllHistoryInMemory = false;
    this.params = {
      unMatchedFramesTolerance: 5,
      iouLimit: 0.05,
      fastDelete: true,
      distanceFunc: this.iouDistance,
      distanceLimit: 10000,
      matchingAlgorithm: "kdTree",
    };
  }

  iouDistance = (item1, item2) => {
    var iou = iouAreas(item1, item2);
    var distance = 1 - iou;
    if (distance > 1 - this.params.iouLimit) {
      distance = this.params.distanceLimit + 1;
    }

    return distance;
  };

  setParams = (newParams) => {
    Object.keys(newParams).forEach((key) => {
      this.params[key] = newParams[key];
    });
  };

  updateTrackedItemsWithNewFrame = (detectionsOfThisFrame, frameNb) => {
    // A kd-tree containing all the itemtracked
    // Need to rebuild on each frame, because itemTracked positions have changed
    var treeItemsTracked = new kdTree(
      Array.from(this.mapOfItemsTracked.values()),
      this.params.distanceFunc,
      ["x", "y", "w", "h"]
    );

    // Contruct a kd tree for the detections of this frame
    var treeDetectionsOfThisFrame = new kdTree(
      detectionsOfThisFrame,
      this.params.distanceFunc,
      ["x", "y", "w", "h"]
    );

    // SCENARIO 1: itemsTracked map is empty
    if (this.mapOfItemsTracked.size === 0) {
      // Just add every detected item as item Tracked
      detectionsOfThisFrame.forEach((itemDetected) => {
        var newItemTracked = new ItemTracked(
          itemDetected,
          frameNb,
          this.params.unMatchedFramesTolerance,
          this.params.fastDelete,
          this.idDisplay
        );
        this.idDisplay++;
        // Add it to the map
        this.mapOfItemsTracked.set(newItemTracked.id, newItemTracked);
        // Add it to the kd tree
        treeItemsTracked.insert(newItemTracked);
      });
    }
    // SCENARIO 2: We already have itemsTracked in the map
    else {
      var matchedList = new Array(detectionsOfThisFrame.length);
      matchedList.fill(false);
      // Match existing Tracked items with the items detected in the new frame
      // For each look in the new detection to find the closest match
      if (detectionsOfThisFrame.length > 0) {
        if (this.params.matchingAlgorithm === "munkres") {
          var trackedItemIds = Array.from(this.mapOfItemsTracked.keys());

          var costMatrix = Array.from(this.mapOfItemsTracked.values()).map(
            (itemTracked) => {
              var predictedPosition = itemTracked.predictNextPosition();
              return detectionsOfThisFrame.map((detection) =>
                this.params.distanceFunc(predictedPosition, detection)
              );
            }
          );

          this.mapOfItemsTracked.forEach((itemTracked) => {
            itemTracked.makeAvailable();
          });

          munkres(costMatrix)
            .filter((m) => costMatrix[m[0]][m[1]] <= this.params.distanceLimit)
            .forEach((m) => {
              var itemTracked = this.mapOfItemsTracked.get(
                trackedItemIds[m[0]]
              );
              var updatedTrackedItemProperties = detectionsOfThisFrame[m[1]];
              matchedList[m[1]] = { idDisplay: itemTracked.idDisplay };
              itemTracked
                .makeUnavailable()
                .update(updatedTrackedItemProperties, frameNb);
            });

          matchedList.forEach((matched, index) => {
            if (!matched) {
              if (
                Math.min(...costMatrix.map((m) => m[index])) >
                this.params.distanceLimit
              ) {
                var newItemTracked = ItemTracked(
                  detectionsOfThisFrame[index],
                  frameNb,
                  this.params.unMatchedFramesTolerance,
                  this.params.fastDelete,
                  this.idDisplay
                );
                this.idDisplay++;
                this.mapOfItemsTracked.set(newItemTracked.id, newItemTracked);
                newItemTracked.makeUnavailable();
                costMatrix.push(
                  detectionsOfThisFrame.map((detection) =>
                    this.params.distanceFunc(newItemTracked, detection)
                  )
                );
              }
            }
          });
        } else if (this.params.matchingAlgorithm === "kdTree") {
          this.mapOfItemsTracked.forEach((itemTracked) => {
            // First predict the new position of the itemTracked
            var predictedPosition = itemTracked.predictNextPosition();

            // Make available for matching
            itemTracked.makeAvailable();

            // Search for a detection that matches
            var treeSearchResult = treeDetectionsOfThisFrame.nearest(
              predictedPosition,
              1,
              this.params.distanceLimit
            )[0];

            // Only for debug assessments of predictions
            var treeSearchResultWithoutPrediction =
              treeDetectionsOfThisFrame.nearest(
                itemTracked,
                1,
                this.params.distanceLimit
              )[0];
            // Only if we enable the extra refinement
            var treeSearchMultipleResults = treeDetectionsOfThisFrame.nearest(
              predictedPosition,
              2,
              this.params.distanceLimit
            );

            // If we have found something
            if (treeSearchResult) {
              if (this.DEBUG_MODE) {
                // Assess different results between predition or not
                if (
                  !isEqual(
                    treeSearchResult[0],
                    treeSearchResultWithoutPrediction &&
                      treeSearchResultWithoutPrediction[0]
                  )
                ) {
                  console.log(
                    "Making the pre-prediction led to a difference result:"
                  );
                  console.log(
                    "For frame " + frameNb + " itemNb " + itemTracked.idDisplay
                  );
                }
              }

              var indexClosestNewDetectedItem = detectionsOfThisFrame.indexOf(
                treeSearchResult[0]
              );
              // If this detections was not already matched to a tracked item
              // (otherwise it would be matched to two tracked items...)
              if (!matchedList[indexClosestNewDetectedItem]) {
                matchedList[indexClosestNewDetectedItem] = {
                  idDisplay: itemTracked.idDisplay,
                };
                // Update properties of tracked object
                var updatedTrackedItemProperties =
                  detectionsOfThisFrame[indexClosestNewDetectedItem];
                this.mapOfItemsTracked
                  .get(itemTracked.id)
                  .makeUnavailable()
                  .update(updatedTrackedItemProperties, frameNb);
              } else {
                // Means two already tracked item are concurrent to get assigned a new detections
                // Rule is to priorize the oldest one to avoid id-reassignment
              }
            }
          });
        } else {
          throw `Unknown matching algorithm "${this.params.matchingAlgorithm}"`;
        }
      } else {
        if (this.DEBUG_MODE) {
          console.log("[Tracker] Nothing detected for frame nº" + frameNb);
        }
        // Make existing tracked item available for deletion (to avoid ghost)
        this.mapOfItemsTracked.forEach((itemTracked) => {
          itemTracked.makeAvailable();
        });
      }

      if (this.params.matchingAlgorithm === "kdTree") {
        // Add any unmatched items as new trackedItem only if those new items are not too similar
        // to existing trackedItems this avoids adding some double match of YOLO and bring down drasticly reassignments
        if (this.mapOfItemsTracked.size > 0) {
          // Safety check to see if we still have object tracked (could have been deleted previously)
          // Rebuild tracked item tree to take in account the new positions
          treeItemsTracked = new kdTree(
            Array.from(this.mapOfItemsTracked.values()),
            this.params.distanceFunc,
            ["x", "y", "w", "h"]
          );
          // console.log(`Nb new items Unmatched : ${matchedList.filter((isMatched) => isMatched === false).length}`)
          matchedList.forEach((matched, index) => {
            // Iterate through unmatched new detections
            if (!matched) {
              // Do not add as new tracked item if it is to similar to an existing one
              var treeSearchResult = treeItemsTracked.nearest(
                detectionsOfThisFrame[index],
                1,
                this.params.distanceLimit
              )[0];

              if (!treeSearchResult) {
                var newItemTracked = ItemTracked(
                  detectionsOfThisFrame[index],
                  frameNb,
                  this.params.unMatchedFramesTolerance,
                  this.params.fastDelete,
                  this.idDisplay
                );
                this.idDisplay++;
                // Add it to the map
                this.mapOfItemsTracked.set(newItemTracked.id, newItemTracked);
                // Add it to the kd tree
                treeItemsTracked.insert(newItemTracked);
                // Make unvailable
                newItemTracked.makeUnavailable();
              } else {
                // console.log('Do not add, its overlapping an existing object')
              }
            }
          });
        }
      }

      // Start killing the itemTracked (and predicting next position)
      // that are tracked but haven't been matched this frame
      this.mapOfItemsTracked.forEach((itemTracked) => {
        if (itemTracked.available) {
          itemTracked.countDown(frameNb);
          itemTracked.updateTheoricalPositionAndSize();
          if (itemTracked.isDead()) {
            this.mapOfItemsTracked.delete(itemTracked.id);
            treeItemsTracked.remove(itemTracked);
            if (this.keepAllHistoryInMemory) {
              this.mapOfAllItemsTracked.set(itemTracked.id, itemTracked);
            }
          }
        }
      });
    }
  };

  enableKeepInMemory = () => {
    this.keepAllHistoryInMemory = true;
  };

  disableKeepInMemory = () => {
    this.keepAllHistoryInMemory = false;
  };

  getJSONOfTrackedItems = (roundInt = true) => {
    return Array.from(this.mapOfItemsTracked.values()).map((itemTracked) => {
      return itemTracked.toJSON(roundInt);
    });
  };

  getJSONDebugOfTrackedItems = (roundInt = true) => {
    return Array.from(this.mapOfItemsTracked.values()).map((itemTracked) => {
      return itemTracked.toJSONDebug(roundInt);
    });
  };

  getTrackedItemsInMOTFormat = (frameNb) => {
    return Array.from(this.mapOfItemsTracked.values()).map((itemTracked) => {
      return itemTracked.toMOT(frameNb);
    });
  };

  // Work only if keepInMemory is enabled
  getAllTrackedItems = () => {
    return this.mapOfAllItemsTracked;
  };

  // Work only if keepInMemory is enabled
  getJSONOfAllTrackedItems = () => {
    return Array.from(this.mapOfAllItemsTracked.values()).map((itemTracked) => {
      return itemTracked.toJSONGenericInfo();
    });
  };

  reset = () => {
    this.mapOfItemsTracked = new Map();
    this.mapOfAllItemsTracked = new Map();
  };
}

module.exports = Tracker;
