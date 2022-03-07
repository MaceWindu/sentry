/**
 * The import code is very similar to speedscope's import code. The queue approach works well and allows us
 * to easily split the X events and handle them. There are some small differences when it comes to building
 * profiles where we opted to throw instead of closing a frame that was never opened.
 *
 * Overall, it seems that mostly typescript compiler uses this output, so we could possibly do a bit more
 * in order to detect if this is a tsc trace and mark the different compiler phases and give users the preference
 * to color encode by the program/bind/check/emit phases.
 */

import {Frame} from 'sentry/utils/profiling/frame';
import {Profile} from 'sentry/utils/profiling/profile/profile';

import {EventedProfile} from './eventedProfile';
import {ProfileGroup} from './importProfile';

export function isChromeTraceFormat(input: any): input is ChromeTrace.ProfileType {
  return isChromeTraceArrayFormat(input) || isChromeTraceObjectFormat(input);
}

function isChromeTraceObjectFormat(input: any): input is ChromeTrace.ObjectFormat {
  return typeof input === 'object' && 'traceEvents' in input;
}

function isChromeTraceArrayFormat(input: any): input is ChromeTrace.ArrayFormat {
  return Array.isArray(input);
}

export function importChromeTrace(input: string | ChromeTrace.ProfileType): ProfileGroup {
  if (isChromeTraceObjectFormat(input)) {
    throw new Error('Chrometrace object format is not yet supported');
  }
  if (isChromeTraceArrayFormat(input)) {
    return parseChromeTraceArrayFormat(input);
  }

  throw new Error('Failed to parse trace input format');
}

type ProcessId = number;
type ThreadId = number;

export function splitEventsByProcessAndTraceId(
  trace: ChromeTrace.ArrayFormat
): Record<ProcessId, Record<ThreadId, ChromeTrace.Event[]>> {
  const collections: Record<ProcessId, Record<ThreadId, ChromeTrace.Event[]>> = {};

  for (let i = 0; i < trace.length; i++) {
    if (typeof trace[i].pid !== 'number') {
      continue;
    }
    if (typeof trace[i].tid !== 'number') {
      continue;
    }

    const event = trace[i];

    if (!collections[event.pid]) {
      collections[event.pid] = {};
    }
    if (!collections[event.pid][event.tid]) {
      collections[event.pid][event.tid] = [];
    }

    collections[event.pid][event.tid].push(event);
  }

  return collections;
}

function chronologicalSort(a: ChromeTrace.Event, b: ChromeTrace.Event): number {
  if (a.ts < b.ts) {
    return -1;
  }
  if (a.ts > b.ts) {
    return 1;
  }
  return 0;
}

function getNextQueue(
  beginQueue: ChromeTrace.Event[],
  endQueue: ChromeTrace.Event[]
): 'B' | 'E' {
  if (!beginQueue.length && !endQueue.length) {
    throw new Error('Profile contains no events');
  }

  const nextBegin = beginQueue[0];
  const nextEnd = endQueue[0];

  if (!nextEnd) {
    return 'B';
  }
  if (!nextBegin) {
    return 'E';
  }
  if (nextBegin.ts < nextEnd.ts) {
    return 'B';
  }
  if (nextEnd.ts < nextBegin.ts) {
    return 'E';
  }
  return 'B';
}

function buildProfile(
  processId: string,
  threadId: string,
  events: ChromeTrace.Event[]
): EventedProfile {
  let processName: string = `pid (${processId})`;
  let threadName: string = `tid (${threadId})`;

  // We dont care about other events besides begin, end, instant events and metadata events
  const timelineEvents = events.filter(
    e => e.ph === 'B' || e.ph === 'E' || e.ph === 'X' || e.ph === 'M'
  );

  // @TODO use a heap so we dont need to sort this again afterwards
  const beginQueue: Array<ChromeTrace.Event> = [];
  const endQueue: Array<ChromeTrace.Event> = [];

  for (let i = 0; i < timelineEvents.length; i++) {
    const event = timelineEvents[i];

    // M events are not pushed to the queue, we just store their information
    if (event.ph === 'M') {
      if (event.name === 'thread_name' && typeof event.args.name === 'string') {
        threadName = `${event.args.name} (${threadId})`;
        continue;
      }

      if (event.name === 'process_name' && typeof event.args.name === 'string') {
        processName = `${event.args.name} (${processId})`;
        continue;
      }
    }

    // B, E and X events are pushed to the timeline. We transform all X events into
    // B and E event, so that they can be pushed onto the queue and handled
    if (event.ph === 'B') {
      beginQueue.push(event);
      continue;
    }

    if (event.ph === 'E') {
      endQueue.push(event);
      continue;
    }

    if (event.ph === 'X') {
      if (typeof event.dur === 'number' || typeof event.tdur === 'number') {
        beginQueue.push({...event, ph: 'B'});
        endQueue.push({...event, ph: 'E', ts: event.ts + (event.dur ?? event.tdur ?? 0)});
        continue;
      }
    }
  }

  beginQueue.sort(chronologicalSort);
  endQueue.sort(chronologicalSort);

  if (!beginQueue.length) {
    throw new Error('Profile does not contain any frame events');
  }

  const firstTimestamp = beginQueue[0].ts;

  if (typeof firstTimestamp !== 'number') {
    throw new Error('First begin event contains no timestamp');
  }

  const profile = new EventedProfile(
    0,
    0,
    0,
    `${processName}: ${threadName}`,
    'milliseconds'
  );

  const stack: ChromeTrace.Event[] = [];
  const frameCache = new Map<string, Frame>();

  while (beginQueue.length > 0 || endQueue.length > 0) {
    const next = getNextQueue(beginQueue, endQueue);

    if (next === 'B') {
      const item = beginQueue.shift();
      if (!item) {
        throw new Error('Nothing to take from begin queue');
      }

      const frameInfo = createFrameInfoFromEvent(item);

      if (!frameCache.has(frameInfo.key)) {
        frameCache.set(frameInfo.key, new Frame(frameInfo));
      }

      const frame = frameCache.get(frameInfo.key)!;
      profile.enterFrame(frame, item.ts - firstTimestamp);
      stack.push(item);
      continue;
    }

    if (next === 'E') {
      const item = endQueue.shift()!;
      let frameInfo = createFrameInfoFromEvent(item);
      const topFrameInfro = createFrameInfoFromEvent(stack[stack.length - 1]);

      for (let i = 1; i < endQueue.length; i++) {
        if (endQueue[i].ts > endQueue[0].ts) {
          break;
        }

        const nextEndInfo = createFrameInfoFromEvent(endQueue[i]);
        if (topFrameInfro.key === nextEndInfo.key) {
          const tmp = endQueue[0];
          endQueue[0] = endQueue[i];
          endQueue[i] = tmp;

          frameInfo = nextEndInfo;
          break;
        }
      }

      if (!frameCache.has(frameInfo.key)) {
        throw new Error(
          `Cannot leave frame that was never entered, leaving ${frameInfo.key}`
        );
      }

      const frame = frameCache.get(frameInfo.key)!;
      profile.leaveFrame(frame, item.ts - firstTimestamp);
      stack.pop();
      continue;
    }
  }

  // Close the leftover frames in stack
  while (stack.length) {
    const item = stack.pop()!;
    const frameInfo = createFrameInfoFromEvent(item);

    const frame = frameCache.get(frameInfo.key);
    if (!frame) {
      throw new Error(
        `Cannot leave frame that was never entered, leaving ${frameInfo.key}`
      );
    }
    profile.leaveFrame(frame, frame.totalWeight);
  }

  return profile.build();
}

function createFrameInfoFromEvent(event: ChromeTrace.Event) {
  const key = JSON.stringify(event.args);

  return {
    key,
    name: `${event?.name || 'Unknown'} ${key}`.trim(),
  };
}

export function parseChromeTraceArrayFormat(
  input: ChromeTrace.ArrayFormat
): ProfileGroup {
  const profiles: Profile[] = [];
  const eventsByProcessAndThreadID = splitEventsByProcessAndTraceId(input);

  for (const processId in eventsByProcessAndThreadID) {
    for (const threadId in eventsByProcessAndThreadID[processId]) {
      profiles.push(
        buildProfile(
          processId,
          threadId,
          eventsByProcessAndThreadID[processId][threadId] ?? []
        )
      );
    }
  }

  return {
    name: 'chrometrace',
    traceID: '',
    activeProfileIndex: 0,
    profiles,
  };
}
