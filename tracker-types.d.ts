declare module "node-moving-things-tracker" {
  type iouBox = {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  type Params = {
    unMatchedFramesTolerance: number;
    iouLimit: number;
    fastDelete: true;
    distanceFunc: (item1: iouBox, item2: iouBox) => number;
    distanceLimit: number;
    matchingAlgorithm: string;
  };
  type TrackedItems = {
    id: number;
    idDisplay: number;
    appearFrame: Buffer;
    disappearFrame: Buffer | null;
    disappearArea: iouBox;
    nbActiveFrame: Buffer;
    name: string;
  };
  export type TrackerInputs = iouBox & {
    name: string;
    confidence: number;
  };

  export type TrackerOutputs = TrackerInputs & {
    id: number;
    isZombie: boolean;
  };

  export type TrackerDebugOutputs = TrackerOutputs & {
    idDisplay: number;
    appearFrame: Buffer;
    disappearFrame: Buffer | null;
  };

  export class Tracker {
    DEBUG_MODE: boolean;
    idDisplay: number;
    mapOfItemsTracked: Map<any, any>;
    mapOfAllItemsTracked: Map<any, any>;
    keepAllHistoryInMemory: boolean;
    params: Params;

    constructor();

    /**
     * Calculates the Intersection Over Union (IoU) distance between two bounding boxes.
     *
     * @param {iouBox} item1 - The first bounding box.
     * @param {iouBox} item2 - The second bounding box.
     * @returns {number} The calculated IoU distance between the two boxes.
     */
    iouDistance(item1: iouBox, item2: iouBox): number;

    /**
     * Updates the parameters of the tracker instance.
     *
     * @param {Params} newParams - The new parameters to update in the tracker.
     * @returns {void}
     */
    setParams(newParams: Params): void;

    /**
     * Updates the tracked items using new frame data.
     * @param detections - The detection results for this frame.
     * @param buffer - The image buffer for the frame.
     */
    updateTrackedItemsWithNewFrame(
      detections: TrackerInputs[],
      buffer: Buffer
    ): void;

    /**
     * Enables the option to keep the tracking history of frames in memory.
     *
     * @returns {void}
     */
    enableKeepInMemory(): void;

    /**
     * Disables the option to keep the tracking history of frames in memory.
     *
     * @returns {void}
     */
    disableKeepInMemory(): void;

    /**
     * Returns a JSON representation of the tracked items.
     * @param roundInt - Whether to round integer values in the result (default: true).
     * @returns Tracker data for this frame in JSON format.
     */
    getJSONOfTrackedItems(roundInt?: boolean = true): TrackerOutputs[];

    /**
     * Retrieves debug information for the current frame in JSON format.
     *
     * @param {boolean} [roundInt=true] - Whether to round integer values in the output.
     * @returns {TrackerDebugOutputs[]} An array of debug outputs for tracked items in the current frame.
     */
    getJSONDebugOfTrackedItems(
      roundInt?: boolean = true
    ): TrackerDebugOutputs[];

    /**
     * Retrieves tracked items in MOT (Multiple Object Tracking) format for a specific frame.
     *
     * @param {Buffer} frameNb - The frame or image buffer.
     * @returns {string[]} An array of strings representing tracked items in MOT format.
     */
    getTrackedItemsInMOTFormat(frameNb: Buffer): string[];

    /**
     * Retrieves all tracked items from memory, spanning across all frames.
     *
     * @returns {Map<any, any>} A map containing all tracked items.
     */
    getAllTrackedItems(): Map<any, any>;

    /**
     * Retrieves all tracked items from memory in JSON format.
     *
     * @returns {TrackedItems[]} An array of tracked items represented as JSON objects.
     */
    getJSONOfAllTrackedItems(): TrackedItems[];

    /**
     * Resets the internal state of the tracker.
     */
    reset(): void;
  }
}
