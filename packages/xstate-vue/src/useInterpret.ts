import { onBeforeUnmount, onMounted } from 'vue';
import {
  EventObject,
  interpret,
  Interpreter,
  InterpreterOptions,
  MachineContext,
  MachineImplementationsSimplified,
  Observer,
  State,
  StateMachine
} from 'xstate';
import { MaybeLazy, UseMachineOptions } from './types';

// copied from core/src/utils.ts
// it avoids a breaking change between this package and XState which is its peer dep
function toObserver<T>(
  nextHandler: Observer<T> | ((value: T) => void),
  errorHandler?: (error: any) => void,
  completionHandler?: () => void
): Observer<T> {
  if (typeof nextHandler === 'object') {
    return nextHandler;
  }

  const noop = () => void 0;

  return {
    next: nextHandler,
    error: errorHandler || noop,
    complete: completionHandler || noop
  };
}

export function useInterpret<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  getMachine: MaybeLazy<StateMachine<TContext, TEvent>>,
  options: Partial<InterpreterOptions> &
    Partial<UseMachineOptions<TContext, TEvent>> &
    Partial<MachineImplementationsSimplified<TContext, TEvent>> = {},
  observerOrListener?:
    | Observer<State<TContext, TEvent>>
    | ((value: State<TContext, TEvent>) => void)
): Interpreter<TContext, TEvent> {
  const machine = typeof getMachine === 'function' ? getMachine() : getMachine;

  const {
    context,
    guards,
    actions,
    actors,
    delays,
    state: rehydratedState,
    ...interpreterOptions
  } = options;

  const machineConfig = {
    context,
    guards,
    actions,
    actors,
    delays
  };

  const machineWithConfig = machine.provide({
    ...machineConfig,
    context
  } as any);

  const service = interpret(machineWithConfig, interpreterOptions).start(
    rehydratedState ? (State.create(rehydratedState) as any) : undefined
  );

  let sub;
  onMounted(() => {
    if (observerOrListener) {
      sub = service.subscribe(toObserver(observerOrListener as any));
    }
  });

  onBeforeUnmount(() => {
    service.stop();
    sub?.unsubscribe();
  });

  return service as any;
}
