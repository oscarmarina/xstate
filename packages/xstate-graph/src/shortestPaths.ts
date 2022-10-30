import { EventObject, AnyStateMachine, StateFrom, EventFrom } from 'xstate';
import {
  SerializedEvent,
  SerializedState,
  SimpleBehavior,
  StatePath,
  StatePlanMap,
  TraversalOptions
} from './types';
import {
  resolveTraversalOptions,
  createDefaultMachineOptions,
  joinPaths
} from './graph';
import { getAdjacencyMap } from './adjacency';
import { flatten } from 'xstate/src/utils';
import { machineToBehavior } from './machineToBehavior';

export function getShortestPaths<TState, TEvent extends EventObject>(
  behavior: SimpleBehavior<TState, TEvent>,
  options?: TraversalOptions<TState, TEvent>
): Array<StatePath<TState, TEvent>> {
  const config = resolveTraversalOptions(options);
  const serializeState = config.serializeState as (
    ...args: Parameters<typeof config.serializeState>
  ) => SerializedState;
  const fromState = config.fromState ?? behavior.initialState;
  const adjacency = getAdjacencyMap(behavior, config);

  // weight, state, event
  const weightMap = new Map<
    SerializedState,
    {
      weight: number;
      state: SerializedState | undefined;
      event: TEvent | undefined;
    }
  >();
  const stateMap = new Map<SerializedState, TState>();
  const initialSerializedState = serializeState(
    fromState,
    undefined,
    undefined
  );
  stateMap.set(initialSerializedState, fromState);

  weightMap.set(initialSerializedState, {
    weight: 0,
    state: undefined,
    event: undefined
  });
  const unvisited = new Set<SerializedState>();
  const visited = new Set<SerializedState>();

  unvisited.add(initialSerializedState);
  for (const serializedState of unvisited) {
    const prevState = stateMap.get(serializedState);
    const { weight } = weightMap.get(serializedState)!;
    for (const event of Object.keys(
      adjacency[serializedState].transitions
    ) as SerializedEvent[]) {
      const { state: nextState, event: eventObject } = adjacency[
        serializedState
      ].transitions[event];
      const nextSerializedState = serializeState(
        nextState,
        eventObject,
        prevState
      );
      stateMap.set(nextSerializedState, nextState);
      if (!weightMap.has(nextSerializedState)) {
        weightMap.set(nextSerializedState, {
          weight: weight + 1,
          state: serializedState,
          event: eventObject
        });
      } else {
        const { weight: nextWeight } = weightMap.get(nextSerializedState)!;
        if (nextWeight > weight + 1) {
          weightMap.set(nextSerializedState, {
            weight: weight + 1,
            state: serializedState,
            event: eventObject
          });
        }
      }
      if (!visited.has(nextSerializedState)) {
        unvisited.add(nextSerializedState);
      }
    }
    visited.add(serializedState);
    unvisited.delete(serializedState);
  }

  const statePlanMap: StatePlanMap<TState, TEvent> = {};
  const paths: Array<StatePath<TState, TEvent>> = [];

  weightMap.forEach(
    ({ weight, state: fromState, event: fromEvent }, stateSerial) => {
      const state = stateMap.get(stateSerial)!;
      paths.push({
        state,
        steps: !fromState
          ? []
          : statePlanMap[fromState].paths[0].steps.concat({
              state: stateMap.get(fromState)!,
              event: fromEvent!
            }),
        weight
      });
      statePlanMap[stateSerial] = {
        state,
        paths: [
          {
            state,
            steps: !fromState
              ? []
              : statePlanMap[fromState].paths[0].steps.concat({
                  state: stateMap.get(fromState)!,
                  event: fromEvent!
                }),
            weight
          }
        ]
      };
    }
  );

  if (config.toState) {
    return paths.filter((path) => config.toState!(path.state));
  }

  return paths;
}

export function getMachineShortestPaths<TMachine extends AnyStateMachine>(
  machine: TMachine,
  options?: TraversalOptions<StateFrom<TMachine>, EventFrom<TMachine>>
): Array<StatePath<StateFrom<TMachine>, EventFrom<TMachine>>> {
  const resolvedOptions = resolveTraversalOptions(
    options,
    createDefaultMachineOptions(machine)
  );

  return getShortestPaths(machineToBehavior(machine), resolvedOptions);
}

export function getShortestPathsFromTo<TState, TEvent extends EventObject>(
  behavior: SimpleBehavior<TState, TEvent>,
  fromPredicate: (state: TState) => boolean,
  toPredicate: (state: TState) => boolean,
  options?: TraversalOptions<TState, TEvent>
): Array<StatePath<TState, TEvent>> {
  const fromStateOptions = resolveTraversalOptions({
    ...options,
    toState: fromPredicate
  });

  // First, find all the shortest paths to the "from" state
  const fromStatePaths = getShortestPaths(behavior, fromStateOptions);

  // Then from each "from" state, find the paths to the "to" state

  const fromToPaths = flatten(
    fromStatePaths.map((fromStatePath) => {
      const toStateOptions = resolveTraversalOptions({
        ...options,
        fromState: fromStatePath.state,
        toState: toPredicate
      });

      const toStatePath = getShortestPaths(behavior, toStateOptions);

      return toStatePath.map((toStatePath) =>
        joinPaths(fromStatePath, toStatePath)
      );
    })
  );

  return fromToPaths;
}

export function getMachineShortestPathsFromTo<TMachine extends AnyStateMachine>(
  machine: TMachine,
  fromPredicate: (state: StateFrom<TMachine>) => boolean,
  toPredicate: (state: StateFrom<TMachine>) => boolean,
  options?: TraversalOptions<StateFrom<TMachine>, EventFrom<TMachine>>
): Array<StatePath<StateFrom<TMachine>, EventFrom<TMachine>>> {
  const resolvedOptions = resolveTraversalOptions(
    options,
    createDefaultMachineOptions(machine)
  );

  return getShortestPathsFromTo(
    machineToBehavior(machine),
    fromPredicate,
    toPredicate,
    resolvedOptions
  );
}
