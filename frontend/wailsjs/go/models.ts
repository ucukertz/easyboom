export namespace main {
	
	export class VideoMetadata {
	    frames: number;
	    fps: number;
	
	    static createFrom(source: any = {}) {
	        return new VideoMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.frames = source["frames"];
	        this.fps = source["fps"];
	    }
	}

}

