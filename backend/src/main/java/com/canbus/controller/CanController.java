package com.canbus.controller;

import com.canbus.model.CanFrame;
import com.canbus.service.CanService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class CanController {

    private final CanService canService;
    private int totalFrameCount = 0;

    public CanController(CanService canService) {
        this.canService = canService;
    }

    /**
     * GET /api/frames - return mock CAN frame list
     */
    @GetMapping("/frames")
    public List<CanFrame> getFrames() {
        List<CanFrame> frames = canService.generateMockFrames();
        totalFrameCount += frames.size();
        return frames;
    }

    /**
     * POST /api/dbc/parse - accept DBC text, return parsed messages
     */
    @PostMapping("/dbc/parse")
    public Map<String, Object> parseDbc(@RequestBody String dbcText) {
        return canService.parseDbc(dbcText);
    }

    /**
     * GET /api/stats - return bus statistics
     */
    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        return canService.getStats(totalFrameCount);
    }

    /**
     * GET /api/frames/history - query frames by time range
     * @param startTime start timestamp in ms
     * @param endTime end timestamp in ms
     * @return frames within the time range
     */
    @GetMapping("/frames/history")
    public List<CanFrame> getFramesByTimeRange(
            @RequestParam long startTime,
            @RequestParam long endTime) {
        return canService.queryFramesByTimeRange(startTime, endTime);
    }

    /**
     * GET /api/frames/range - get the available history time range
     * @return map with startTime, endTime, totalCount
     */
    @GetMapping("/frames/range")
    public Map<String, Long> getHistoryTimeRange() {
        return canService.getHistoryTimeRange();
    }
}
