import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { clamp } from '@radix-ui/number';
import { composeEventHandlers } from '@radix-ui/primitive';
import { createCollection } from '@radix-ui/react-collection';
import { useComposedRefs } from '@radix-ui/react-compose-refs';
import { createContextScope } from '@radix-ui/react-context';
import { DismissableLayer } from '@radix-ui/react-dismissable-layer';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { useId } from '@radix-ui/react-id';
import { useLabelContext } from '@radix-ui/react-label';
import { Portal } from '@radix-ui/react-portal';
import { Primitive } from '@radix-ui/react-primitive';
import { useCallbackRef } from '@radix-ui/react-use-callback-ref';
import { useControllableState } from '@radix-ui/react-use-controllable-state';
import { useLayoutEffect } from '@radix-ui/react-use-layout-effect';
import { usePrevious } from '@radix-ui/react-use-previous';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { hideOthers } from 'aria-hidden';
import { RemoveScroll } from 'react-remove-scroll';

import type * as Radix from '@radix-ui/react-primitive';
import type { Scope } from '@radix-ui/react-context';

type Direction = 'ltr' | 'rtl';

const OPEN_KEYS = [' ', 'Enter', 'ArrowUp', 'ArrowDown'];
const SELECTION_KEYS = [' ', 'Enter'];

/* -------------------------------------------------------------------------------------------------
 * Select
 * -----------------------------------------------------------------------------------------------*/

const SELECT_NAME = 'Select';

type ItemData = { value: string; disabled: boolean; textValue: string };
const [Collection, useCollection, createCollectionScope] = createCollection<
  SelectItemElement,
  ItemData
>(SELECT_NAME);

type ScopedProps<P> = P & { __scopeSelect?: Scope };
const [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
  createCollectionScope,
]);

type SelectContextValue = {
  trigger: SelectTriggerElement | null;
  onTriggerChange(node: SelectTriggerElement | null): void;
  valueNode: SelectValueElement | null;
  onValueNodeChange(node: SelectValueElement): void;
  valueNodeHasChildren: boolean;
  onValueNodeHasChildrenChange(hasChildren: boolean): void;
  contentId: string;
  value: string;
  onValueChange(value: string): void;
  open: boolean;
  onOpenChange(open: boolean): void;
  dir: SelectProps['dir'];
  bubbleSelect: HTMLSelectElement | null;
  triggerPointerDownPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
};

const [SelectProvider, useSelectContext] = createSelectContext<SelectContextValue>(SELECT_NAME);

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?(value: string): void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?(open: boolean): void;
  dir?: Direction;
  name?: string;
  autoComplete?: string;
  children?: React.ReactNode;
}

const Select: React.FC<SelectProps> = (props: ScopedProps<SelectProps>) => {
  const {
    __scopeSelect,
    children,
    open: openProp,
    defaultOpen,
    onOpenChange,
    value: valueProp,
    defaultValue,
    onValueChange,
    dir,
    name,
    autoComplete,
  } = props;
  const [trigger, setTrigger] = React.useState<SelectTriggerElement | null>(null);
  const [valueNode, setValueNode] = React.useState<SelectValueElement | null>(null);
  const [valueNodeHasChildren, setValueNodeHasChildren] = React.useState(false);
  const [open = false, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });
  const [value = '', setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChange,
  });
  // We set this to true by default so that events bubble to forms without JS (SSR)
  const isFormControl = trigger ? Boolean(trigger.closest('form')) : true;
  const [bubbleSelect, setBubbleSelect] = React.useState<HTMLSelectElement | null>(null);
  const triggerPointerDownPosRef = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <SelectProvider
      scope={__scopeSelect}
      trigger={trigger}
      onTriggerChange={setTrigger}
      valueNode={valueNode}
      onValueNodeChange={setValueNode}
      valueNodeHasChildren={valueNodeHasChildren}
      onValueNodeHasChildrenChange={setValueNodeHasChildren}
      contentId={useId()}
      value={value}
      onValueChange={setValue}
      open={open}
      onOpenChange={setOpen}
      dir={dir}
      bubbleSelect={bubbleSelect}
      triggerPointerDownPosRef={triggerPointerDownPosRef}
    >
      <Collection.Provider scope={__scopeSelect}>{children}</Collection.Provider>
      {isFormControl ? (
        <BubbleSelect
          ref={setBubbleSelect}
          aria-hidden
          tabIndex={-1}
          name={name}
          autoComplete={autoComplete}
          value={value}
          // enable form autofill
          onChange={(event) => setValue(event.target.value)}
        />
      ) : null}
    </SelectProvider>
  );
};

Select.displayName = SELECT_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectTrigger
 * -----------------------------------------------------------------------------------------------*/

const TRIGGER_NAME = 'SelectTrigger';

type SelectTriggerElement = React.ElementRef<typeof Primitive.button>;
type PrimitiveButtonProps = Radix.ComponentPropsWithoutRef<typeof Primitive.button>;
interface SelectTriggerProps extends PrimitiveButtonProps {}

const SelectTrigger = React.forwardRef<SelectTriggerElement, SelectTriggerProps>(
  (props: ScopedProps<SelectTriggerProps>, forwardedRef) => {
    const {
      __scopeSelect,
      disabled = false,
      'aria-labelledby': ariaLabelledby,
      ...triggerProps
    } = props;
    const context = useSelectContext(TRIGGER_NAME, __scopeSelect);
    const composedRefs = useComposedRefs(forwardedRef, context.onTriggerChange);
    const getItems = useCollection(__scopeSelect);
    const labelId = useLabelContext(context.trigger);
    const labelledBy = ariaLabelledby || labelId;

    const [searchRef, handleTypeaheadSearch, resetTypeahead] = useTypeaheadSearch((search) => {
      const enabledItems = getItems().filter((item) => !item.disabled);
      const currentItem = enabledItems.find((item) => item.value === context.value);
      const nextItem = findNextItem(enabledItems, search, currentItem);
      if (nextItem !== undefined) {
        context.onValueChange(nextItem.value);
      }
    });

    const handleOpen = () => {
      if (!disabled) {
        context.onOpenChange(true);
        // reset typeahead when we open
        resetTypeahead();
      }
    };

    return (
      <Primitive.button
        type="button"
        role="combobox"
        aria-controls={context.contentId}
        aria-expanded={context.open}
        aria-autocomplete="none"
        aria-labelledby={labelledBy}
        dir={context.dir}
        disabled={disabled}
        data-disabled={disabled ? '' : undefined}
        {...triggerProps}
        ref={composedRefs}
        onPointerDown={composeEventHandlers(triggerProps.onPointerDown, (event) => {
          // prevent implicit pointer capture
          // https://www.w3.org/TR/pointerevents3/#implicit-pointer-capture
          (event.target as HTMLElement).releasePointerCapture(event.pointerId);

          // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
          // but not when the control key is pressed (avoiding MacOS right click)
          if (event.button === 0 && event.ctrlKey === false) {
            handleOpen();
            context.triggerPointerDownPosRef.current = {
              x: Math.round(event.pageX),
              y: Math.round(event.pageY),
            };
            // prevent trigger from stealing focus from the active item after opening.
            event.preventDefault();
          }
        })}
        onKeyDown={composeEventHandlers(triggerProps.onKeyDown, (event) => {
          const isTypingAhead = searchRef.current !== '';
          const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
          if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
          if (isTypingAhead && event.key === ' ') return;
          if (OPEN_KEYS.includes(event.key)) {
            handleOpen();
            event.preventDefault();
          }
        })}
      />
    );
  }
);

SelectTrigger.displayName = TRIGGER_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectValue
 * -----------------------------------------------------------------------------------------------*/

const VALUE_NAME = 'SelectValue';

type SelectValueElement = React.ElementRef<typeof Primitive.span>;
type PrimitiveSpanProps = Radix.ComponentPropsWithoutRef<typeof Primitive.span>;
interface SelectValueProps extends PrimitiveSpanProps {}

const SelectValue = React.forwardRef<SelectValueElement, SelectValueProps>(
  (props: ScopedProps<SelectValueProps>, forwardedRef) => {
    // We ignore `className` and `style` as this part shouldn't be styled.
    const { __scopeSelect, className, style, ...valueProps } = props;
    const context = useSelectContext(VALUE_NAME, __scopeSelect);
    const { onValueNodeHasChildrenChange } = context;
    const hasChildren = props.children !== undefined;
    const composedRefs = useComposedRefs(forwardedRef, context.onValueNodeChange);

    React.useEffect(() => {
      onValueNodeHasChildrenChange(hasChildren);
    }, [onValueNodeHasChildrenChange, hasChildren]);

    return (
      <Primitive.span
        {...valueProps}
        ref={composedRefs}
        // we don't want events from the portalled `SelectValue` children to bubble
        // through the item they came from
        style={{ pointerEvents: 'none' }}
      />
    );
  }
);

SelectValue.displayName = VALUE_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectIcon
 * -----------------------------------------------------------------------------------------------*/

const ICON_NAME = 'SelectIcon';

type SelectIconElement = React.ElementRef<typeof Primitive.span>;
interface SelectIconProps extends PrimitiveSpanProps {}

const SelectIcon = React.forwardRef<SelectIconElement, SelectIconProps>(
  (props: ScopedProps<SelectIconProps>, forwardedRef) => {
    const { __scopeSelect, children, ...iconProps } = props;
    return (
      <Primitive.span aria-hidden {...iconProps} ref={forwardedRef}>
        {children || '▼'}
      </Primitive.span>
    );
  }
);

SelectIcon.displayName = ICON_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectContent
 * -----------------------------------------------------------------------------------------------*/

const CONTENT_NAME = 'SelectContent';

type SelectContentElement = SelectContentImplElement;
interface SelectContentProps extends SelectContentImplProps {}

const SelectContent = React.forwardRef<SelectContentElement, SelectContentProps>(
  (props: ScopedProps<SelectContentProps>, forwardedRef) => {
    const context = useSelectContext(CONTENT_NAME, props.__scopeSelect);
    const [fragment, setFragment] = React.useState<DocumentFragment>();

    // setting the fragment in `useLayoutEffect` as `DocumentFragment` doesn't exist on the server
    useLayoutEffect(() => {
      setFragment(new DocumentFragment());
    }, []);

    return context.open ? (
      <SelectContentImpl {...props} ref={forwardedRef} />
    ) : fragment ? (
      ReactDOM.createPortal(
        // @ts-ignore: This is to avoid the "SelectViewport must be inside "SelectContent" error
        <SelectContentContextProvider scope={props.__scopeSelect}>
          <Collection.Slot scope={props.__scopeSelect}>
            <div>{props.children}</div>
          </Collection.Slot>
        </SelectContentContextProvider>,
        fragment as any
      )
    ) : null;
  }
);

const CONTENT_MARGIN = 10;

type SelectContentContextValue = {
  contentWrapper: HTMLDivElement | null;
  content: SelectContentElement | null;
  viewport: SelectViewportElement | null;
  onViewportChange(node: SelectViewportElement | null): void;
  selectedItem: SelectItemElement | null;
  onSelectedItemChange(node: SelectItemElement | null): void;
  selectedItemText: SelectItemTextElement | null;
  onSelectedItemTextChange(node: SelectItemTextElement | null): void;
  onScrollButtonChange(node: SelectScrollButtonImplElement | null): void;
  onItemLeave(): void;
  isPositioned: boolean;
  shouldExpandOnScrollRef: React.RefObject<boolean>;
  searchRef: React.RefObject<string>;
};

const [SelectContentContextProvider, useSelectContentContext] =
  createSelectContext<SelectContentContextValue>(CONTENT_NAME);

type SelectContentImplElement = React.ElementRef<typeof DismissableLayer>;
type DismissableLayerProps = Radix.ComponentPropsWithoutRef<typeof DismissableLayer>;
type FocusScopeProps = Radix.ComponentPropsWithoutRef<typeof FocusScope>;
interface SelectContentImplProps
  extends Omit<
    DismissableLayerProps,
    'disableOutsidePointerEvents' | 'onFocusOutside' | 'onInteractOutside' | 'onDismiss'
  > {
  /**
   * Event handler called when auto-focusing on close.
   * Can be prevented.
   */
  onCloseAutoFocus?: FocusScopeProps['onUnmountAutoFocus'];
}

const SelectContentImpl = React.forwardRef<SelectContentImplElement, SelectContentImplProps>(
  (props: ScopedProps<SelectContentImplProps>, forwardedRef) => {
    const { __scopeSelect, onCloseAutoFocus, ...contentProps } = props;
    const context = useSelectContext(CONTENT_NAME, __scopeSelect);
    const [contentWrapper, setContentWrapper] = React.useState<HTMLDivElement | null>(null);
    const [content, setContent] = React.useState<SelectContentImplElement | null>(null);
    const [viewport, setViewport] = React.useState<SelectViewportElement | null>(null);
    const composedRefs = useComposedRefs(forwardedRef, (node) => setContent(node));
    const [selectedItem, setSelectedItem] = React.useState<SelectItemElement | null>(null);
    const [selectedItemText, setSelectedItemText] = React.useState<SelectItemTextElement | null>(
      null
    );
    const getItems = useCollection(__scopeSelect);
    const [isPositioned, setIsPositioned] = React.useState(false);
    const shouldRepositionRef = React.useRef(true);
    const shouldExpandOnScrollRef = React.useRef(false);

    // aria-hide everything except the content (better supported equivalent to setting aria-modal)
    React.useEffect(() => {
      if (content) return hideOthers(content);
    }, [content]);

    const focusFirst = React.useCallback(
      (candidates: Array<HTMLElement | null>) => {
        const [firstItem, ...restItems] = getItems().map((item) => item.ref.current);
        const [lastItem] = restItems.slice(-1);

        const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
        for (const candidate of candidates) {
          // if focus is already where we want to go, we don't want to keep going through the candidates
          if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
          candidate?.scrollIntoView({ block: 'nearest' });
          // viewport might have padding so scroll to its edges when focusing first/last items.
          if (candidate === firstItem && viewport) viewport.scrollTop = 0;
          if (candidate === lastItem && viewport) viewport.scrollTop = viewport.scrollHeight;
          candidate?.focus();
          if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
        }
      },
      [getItems, viewport]
    );

    const position = React.useCallback(() => {
      if (
        context.trigger &&
        context.valueNode &&
        contentWrapper &&
        content &&
        viewport &&
        selectedItem &&
        selectedItemText
      ) {
        const triggerRect = context.trigger.getBoundingClientRect();

        // -----------------------------------------------------------------------------------------
        //  Horizontal positioning
        // -----------------------------------------------------------------------------------------
        const contentRect = content.getBoundingClientRect();
        const valueNodeRect = context.valueNode.getBoundingClientRect();
        const itemTextRect = selectedItemText.getBoundingClientRect();

        if (context.dir !== 'rtl') {
          const itemTextOffset = itemTextRect.left - contentRect.left;
          const left = valueNodeRect.left - itemTextOffset;
          const leftDelta = triggerRect.left - left;
          const minContentWidth = triggerRect.width + leftDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const rightEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedLeft = clamp(left, [CONTENT_MARGIN, rightEdge - contentWidth]);

          contentWrapper.style.minWidth = minContentWidth + 'px';
          contentWrapper.style.left = clampedLeft + 'px';
        } else {
          const itemTextOffset = contentRect.right - itemTextRect.right;
          const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
          const rightDelta = window.innerWidth - triggerRect.right - right;
          const minContentWidth = triggerRect.width + rightDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const leftEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedRight = clamp(right, [CONTENT_MARGIN, leftEdge - contentWidth]);

          contentWrapper.style.minWidth = minContentWidth + 'px';
          contentWrapper.style.right = clampedRight + 'px';
        }

        // -----------------------------------------------------------------------------------------
        // Vertical positioning
        // -----------------------------------------------------------------------------------------
        const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
        const minContentHeight = selectedItem.offsetHeight * 5;
        const itemsHeight = viewport.scrollHeight;

        const contentStyles = window.getComputedStyle(content);
        const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
        const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
        const contentBorderBottomWidth = parseInt(contentStyles.borderBottomWidth, 10);
        const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
        const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth; // prettier-ignore

        const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
        const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;

        const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
        const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
        const contentTopToItemMiddle = contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
        const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;

        const willAlignWithoutTopOverflow = contentTopToItemMiddle <= topEdgeToTriggerMiddle;

        if (willAlignWithoutTopOverflow) {
          contentWrapper.style.bottom = 0 + 'px';
          const viewportOffsetBottom =
            content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
          const clampedTriggerMiddleToBottomEdge = Math.max(
            triggerMiddleToBottomEdge,
            selectedItemHalfHeight + viewportOffsetBottom + contentBorderBottomWidth
          );
          const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
          contentWrapper.style.height = height + 'px';
        } else {
          contentWrapper.style.top = 0 + 'px';
          const clampedTopEdgeToTriggerMiddle = Math.max(
            topEdgeToTriggerMiddle,
            contentBorderTopWidth + viewport.offsetTop + selectedItemHalfHeight
          );
          const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
          contentWrapper.style.height = height + 'px';
          viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
        }

        contentWrapper.style.margin = `${CONTENT_MARGIN}px 0`;
        contentWrapper.style.minHeight = minContentHeight + 'px';
        contentWrapper.style.maxHeight = availableHeight + 'px';
        // -----------------------------------------------------------------------------------------

        setIsPositioned(true);

        // we don't want the initial scroll position adjustment to trigger "expand on scroll"
        // so we explicitly turn it on only after they've registered.
        requestAnimationFrame(() => (shouldExpandOnScrollRef.current = true));
      }
    }, [
      context.trigger,
      context.valueNode,
      contentWrapper,
      content,
      viewport,
      selectedItem,
      selectedItemText,
      context.dir,
    ]);

    useLayoutEffect(() => position(), [position]);

    const focusSelectedItem = React.useCallback(
      () => focusFirst([selectedItem, content]),
      [focusFirst, selectedItem, content]
    );

    // Since this is not dependent on layout, we want to ensure this runs at the same time as
    // other effects across components. Hence why we don't call `focusSelectedItem` inside `position`.
    React.useEffect(() => {
      if (isPositioned) {
        focusSelectedItem();
      }
    }, [isPositioned, focusSelectedItem]);

    // When the viewport becomes scrollable at the top, the scroll up button will mount.
    // Because it is part of the normal flow, it will push down the viewport, thus throwing our
    // trigger => selectedItem alignment off by the amount the viewport was pushed down.
    // We wait for this to happen and then re-run the positining logic one more time to account for it.
    const handleScrollButtonChange = React.useCallback(
      (node) => {
        if (node && shouldRepositionRef.current === true) {
          position();
          focusSelectedItem();
          shouldRepositionRef.current = false;
        }
      },
      [position, focusSelectedItem]
    );

    // prevent selecting items on `pointerup` in some cases after opening from `pointerdown`
    // and close on `pointerup` outside.
    const { onOpenChange, triggerPointerDownPosRef } = context;
    React.useEffect(() => {
      if (content) {
        let pointerMoveDelta = { x: 0, y: 0 };

        const handlePointerMove = (event: PointerEvent) => {
          pointerMoveDelta = {
            x: Math.abs(Math.round(event.pageX) - (triggerPointerDownPosRef.current?.x ?? 0)),
            y: Math.abs(Math.round(event.pageY) - (triggerPointerDownPosRef.current?.y ?? 0)),
          };
        };
        const handlePointerUp = (event: PointerEvent) => {
          // If the pointer hasn't moved by a certain threshold then we prevent selecting item on `pointerup`.
          if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
            event.preventDefault();
          } else {
            // otherwise, if the event was outside the content, close.
            if (!content.contains(event.target as HTMLElement)) {
              onOpenChange(false);
            }
          }
          document.removeEventListener('pointermove', handlePointerMove);
          triggerPointerDownPosRef.current = null;
        };

        if (triggerPointerDownPosRef.current !== null) {
          document.addEventListener('pointermove', handlePointerMove);
          document.addEventListener('pointerup', handlePointerUp, { capture: true, once: true });
        }

        return () => {
          document.removeEventListener('pointermove', handlePointerMove);
          document.removeEventListener('pointerup', handlePointerUp, { capture: true });
        };
      }
    }, [content, onOpenChange, triggerPointerDownPosRef]);

    React.useEffect(() => {
      const close = () => onOpenChange(false);
      window.addEventListener('blur', close);
      window.addEventListener('resize', close);
      return () => {
        window.removeEventListener('blur', close);
        window.removeEventListener('resize', close);
      };
    }, [onOpenChange]);

    const [searchRef, handleTypeaheadSearch] = useTypeaheadSearch((search) => {
      const enabledItems = getItems().filter((item) => !item.disabled);
      const currentItem = enabledItems.find((item) => item.ref.current === document.activeElement);
      const nextItem = findNextItem(enabledItems, search, currentItem);
      if (nextItem) {
        /**
         * Imperative focus during keydown is risky so we prevent React's batching updates
         * to avoid potential bugs. See: https://github.com/facebook/react/issues/20332
         */
        setTimeout(() => (nextItem.ref.current as HTMLElement).focus());
      }
    });

    const handleItemLeave = React.useCallback(() => content?.focus(), [content]);

    return (
      <SelectContentContextProvider
        scope={__scopeSelect}
        contentWrapper={contentWrapper}
        content={content}
        viewport={viewport}
        onViewportChange={setViewport}
        selectedItem={selectedItem}
        onSelectedItemChange={setSelectedItem}
        selectedItemText={selectedItemText}
        onSelectedItemTextChange={setSelectedItemText}
        onScrollButtonChange={handleScrollButtonChange}
        onItemLeave={handleItemLeave}
        isPositioned={isPositioned}
        shouldExpandOnScrollRef={shouldExpandOnScrollRef}
        searchRef={searchRef}
      >
        <Portal>
          <RemoveScroll>
            <div
              ref={setContentWrapper}
              style={{ display: 'flex', flexDirection: 'column', position: 'fixed', zIndex: 0 }}
            >
              <FocusScope
                asChild
                // we make sure we're not trapping once it's been closed
                // (closed !== unmounted when animating out)
                trapped={context.open}
                onMountAutoFocus={(event) => {
                  // we prevent open autofocus because we manually focus the selected item
                  event.preventDefault();
                }}
                onUnmountAutoFocus={composeEventHandlers(onCloseAutoFocus, (event) => {
                  context.trigger?.focus({ preventScroll: true });
                  event.preventDefault();
                })}
              >
                <DismissableLayer
                  role="listbox"
                  id={context.contentId}
                  data-state={context.open ? 'open' : 'closed'}
                  dir={context.dir}
                  onContextMenu={(event) => event.preventDefault()}
                  {...contentProps}
                  ref={composedRefs}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    // When we get the height of the content, it includes borders. If we were to set
                    // the height without having `boxSizing: 'border-box'` it would be too big.
                    boxSizing: 'border-box',
                    maxHeight: '100%',
                    outline: 'none',
                    ...contentProps.style,
                  }}
                  disableOutsidePointerEvents
                  // When focus is trapped, a focusout event may still happen.
                  // We make sure we don't trigger our `onDismiss` in such case.
                  onFocusOutside={(event) => event.preventDefault()}
                  onDismiss={() => context.onOpenChange(false)}
                  onKeyDown={composeEventHandlers(contentProps.onKeyDown, (event) => {
                    const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;

                    // select should not be navigated using tab key so we prevent it
                    if (event.key === 'Tab') event.preventDefault();

                    if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);

                    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
                      const items = getItems().filter((item) => !item.disabled);
                      let candidateNodes = items.map((item) => item.ref.current!);

                      if (['ArrowUp', 'End'].includes(event.key)) {
                        candidateNodes = candidateNodes.slice().reverse();
                      }
                      if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
                        const currentElement = event.target as SelectItemElement;
                        const currentIndex = candidateNodes.indexOf(currentElement);
                        candidateNodes = candidateNodes.slice(currentIndex + 1);
                      }

                      /**
                       * Imperative focus during keydown is risky so we prevent React's batching updates
                       * to avoid potential bugs. See: https://github.com/facebook/react/issues/20332
                       */
                      setTimeout(() => focusFirst(candidateNodes));

                      event.preventDefault();
                    }
                  })}
                />
              </FocusScope>
            </div>
          </RemoveScroll>
        </Portal>
      </SelectContentContextProvider>
    );
  }
);

SelectContentImpl.displayName = CONTENT_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectViewport
 * -----------------------------------------------------------------------------------------------*/

const VIEWPORT_NAME = 'SelectViewport';

type SelectViewportElement = React.ElementRef<typeof Primitive.div>;
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
interface SelectViewportProps extends PrimitiveDivProps {}

const SelectViewport = React.forwardRef<SelectViewportElement, SelectViewportProps>(
  (props: ScopedProps<SelectViewportProps>, forwardedRef) => {
    const { __scopeSelect, ...viewportProps } = props;
    const contentContext = useSelectContentContext(VIEWPORT_NAME, __scopeSelect);
    const composedRefs = useComposedRefs(forwardedRef, contentContext.onViewportChange);
    const prevScrollTopRef = React.useRef(0);
    return (
      <>
        {/* Hide scrollbars cross-browser and enable momentum scroll for touch devices */}
        <style
          dangerouslySetInnerHTML={{
            __html: `[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}`,
          }}
        />
        <Collection.Slot scope={__scopeSelect}>
          <Primitive.div
            data-radix-select-viewport=""
            role="presentation"
            {...viewportProps}
            ref={composedRefs}
            style={{
              // we use position: 'relative' here on the `viewport` so that when we call
              // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
              // (independent of the scrollUpButton).
              position: 'relative',
              flex: 1,
              overflow: 'auto',
              ...viewportProps.style,
            }}
            onScroll={composeEventHandlers(viewportProps.onScroll, (event) => {
              const viewport = event.currentTarget;
              const { contentWrapper, shouldExpandOnScrollRef } = contentContext;
              if (shouldExpandOnScrollRef.current && contentWrapper) {
                const scrolledBy = Math.abs(prevScrollTopRef.current - viewport.scrollTop);
                if (scrolledBy > 0) {
                  const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
                  const cssMinHeight = parseFloat(contentWrapper.style.minHeight);
                  const cssHeight = parseFloat(contentWrapper.style.height);
                  const prevHeight = Math.max(cssMinHeight, cssHeight);

                  if (prevHeight < availableHeight) {
                    const nextHeight = prevHeight + scrolledBy;
                    const clampedNextHeight = Math.min(availableHeight, nextHeight);
                    const heightDiff = nextHeight - clampedNextHeight;

                    contentWrapper.style.height = clampedNextHeight + 'px';
                    if (contentWrapper.style.bottom === '0px') {
                      viewport.scrollTop = heightDiff > 0 ? heightDiff : 0;
                      // ensure the content stays pinned to the bottom
                      contentWrapper.style.justifyContent = 'flex-end';
                    }
                  }
                }
              }
              prevScrollTopRef.current = viewport.scrollTop;
            })}
          />
        </Collection.Slot>
      </>
    );
  }
);

SelectViewport.displayName = VIEWPORT_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectGroup
 * -----------------------------------------------------------------------------------------------*/

const GROUP_NAME = 'SelectGroup';

type SelectGroupContextValue = { id: string };

const [SelectGroupContextProvider, useSelectGroupContext] =
  createSelectContext<SelectGroupContextValue>(GROUP_NAME);

type SelectGroupElement = React.ElementRef<typeof Primitive.div>;
interface SelectGroupProps extends PrimitiveDivProps {}

const SelectGroup = React.forwardRef<SelectGroupElement, SelectGroupProps>(
  (props: ScopedProps<SelectGroupProps>, forwardedRef) => {
    const { __scopeSelect, ...groupProps } = props;
    const groupId = useId();
    return (
      <SelectGroupContextProvider scope={__scopeSelect} id={groupId}>
        <Primitive.div role="group" aria-labelledby={groupId} {...groupProps} ref={forwardedRef} />
      </SelectGroupContextProvider>
    );
  }
);

SelectGroup.displayName = GROUP_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectLabel
 * -----------------------------------------------------------------------------------------------*/

const LABEL_NAME = 'SelectLabel';

type SelectLabelElement = React.ElementRef<typeof Primitive.div>;
interface SelectLabelProps extends PrimitiveDivProps {}

const SelectLabel = React.forwardRef<SelectLabelElement, SelectLabelProps>(
  (props: ScopedProps<SelectLabelProps>, forwardedRef) => {
    const { __scopeSelect, ...labelProps } = props;
    const groupContext = useSelectGroupContext(LABEL_NAME, __scopeSelect);
    return <Primitive.div id={groupContext.id} {...labelProps} ref={forwardedRef} />;
  }
);

SelectLabel.displayName = LABEL_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectItem
 * -----------------------------------------------------------------------------------------------*/

const ITEM_NAME = 'SelectItem';

type SelectItemContextValue = {
  value: string;
  textId: string;
  isSelected: boolean;
  onItemTextChange(node: SelectItemTextElement | null): void;
};

const [SelectItemContextProvider, useSelectItemContext] =
  createSelectContext<SelectItemContextValue>(ITEM_NAME);

type SelectItemElement = React.ElementRef<typeof Primitive.div>;
interface SelectItemProps extends PrimitiveDivProps {
  value: string;
  disabled?: boolean;
  textValue?: string;
}

const SelectItem = React.forwardRef<SelectItemElement, SelectItemProps>(
  (props: ScopedProps<SelectItemProps>, forwardedRef) => {
    const {
      __scopeSelect,
      value,
      disabled = false,
      textValue: textValueProp,
      ...itemProps
    } = props;
    const context = useSelectContext(ITEM_NAME, __scopeSelect);
    const contentContext = useSelectContentContext(ITEM_NAME, __scopeSelect);
    const isSelected = context.value === value;
    const [textValue, setTextValue] = React.useState(textValueProp ?? '');
    const [isFocused, setIsFocused] = React.useState(false);
    const composedRefs = useComposedRefs(
      forwardedRef,
      isSelected ? contentContext.onSelectedItemChange : undefined
    );
    const textId = useId();

    const handleSelect = () => {
      if (!disabled) {
        context.onValueChange(value);
        context.onOpenChange(false);
      }
    };

    return (
      <SelectItemContextProvider
        scope={__scopeSelect}
        value={value}
        textId={textId}
        isSelected={isSelected}
        onItemTextChange={React.useCallback((node) => {
          setTextValue((prevTextValue) => prevTextValue || (node?.textContent ?? '').trim());
        }, [])}
      >
        <Collection.ItemSlot
          scope={__scopeSelect}
          value={value}
          disabled={disabled}
          textValue={textValue}
        >
          <Primitive.div
            role="option"
            aria-labelledby={textId}
            // `isFocused` caveat fixes stuttering in VoiceOver
            aria-selected={isSelected && isFocused}
            data-state={isSelected ? 'active' : 'inactive'}
            aria-disabled={disabled || undefined}
            data-disabled={disabled ? '' : undefined}
            tabIndex={disabled ? undefined : -1}
            {...itemProps}
            ref={composedRefs}
            onFocus={composeEventHandlers(itemProps.onFocus, () => setIsFocused(true))}
            onBlur={composeEventHandlers(itemProps.onBlur, () => setIsFocused(false))}
            onPointerUp={composeEventHandlers(itemProps.onPointerUp, handleSelect)}
            onPointerMove={composeEventHandlers(itemProps.onPointerMove, (event) => {
              if (disabled) {
                contentContext.onItemLeave();
              } else {
                // even though safari doesn't support this option, it's acceptable
                // as it only means it might scroll a few pixels when using the pointer.
                event.currentTarget.focus({ preventScroll: true });
              }
            })}
            onPointerLeave={composeEventHandlers(itemProps.onPointerLeave, (event) => {
              if (event.currentTarget === document.activeElement) {
                contentContext.onItemLeave();
              }
            })}
            onKeyDown={composeEventHandlers(itemProps.onKeyDown, (event) => {
              const isTypingAhead = contentContext.searchRef.current !== '';
              if (isTypingAhead && event.key === ' ') return;
              if (SELECTION_KEYS.includes(event.key)) handleSelect();
              // prevent page scroll if using the space key to select an item
              if (event.key === ' ') event.preventDefault();
            })}
          />
        </Collection.ItemSlot>
      </SelectItemContextProvider>
    );
  }
);

SelectItem.displayName = ITEM_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectItemText
 * -----------------------------------------------------------------------------------------------*/

const ITEM_TEXT_NAME = 'SelectItemText';

type SelectItemTextElement = React.ElementRef<typeof Primitive.span>;
interface SelectItemTextProps extends PrimitiveSpanProps {}

const SelectItemText = React.forwardRef<SelectItemTextElement, SelectItemTextProps>(
  (props: ScopedProps<SelectItemTextProps>, forwardedRef) => {
    // We ignore `className` and `style` as this part shouldn't be styled.
    const { __scopeSelect, className, style, ...itemTextProps } = props;
    const context = useSelectContext(ITEM_TEXT_NAME, __scopeSelect);
    const contentContext = useSelectContentContext(ITEM_TEXT_NAME, __scopeSelect);
    const itemContext = useSelectItemContext(ITEM_TEXT_NAME, __scopeSelect);
    const ref = React.useRef<SelectItemTextElement | null>(null);
    const composedRefs = useComposedRefs(
      forwardedRef,
      ref,
      itemContext.onItemTextChange,
      itemContext.isSelected ? contentContext.onSelectedItemTextChange : undefined
    );

    return (
      <>
        <Primitive.span id={itemContext.textId} {...itemTextProps} ref={composedRefs} />

        {/* Portal the select item text into the trigger value node */}
        {itemContext.isSelected && context.valueNode && !context.valueNodeHasChildren
          ? ReactDOM.createPortal(itemTextProps.children, context.valueNode)
          : null}

        {/* Portal an option in the bubble select */}
        {context.bubbleSelect
          ? ReactDOM.createPortal(
              // we use `.textContent` because `option` only support `string` or `number`
              <option value={itemContext.value}>{ref.current?.textContent}</option>,
              context.bubbleSelect
            )
          : null}
      </>
    );
  }
);

SelectItemText.displayName = ITEM_TEXT_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectItemIndicator
 * -----------------------------------------------------------------------------------------------*/

const ITEM_INDICATOR_NAME = 'SelectItemIndicator';

type SelectItemIndicatorElement = React.ElementRef<typeof Primitive.span>;
interface SelectItemIndicatorProps extends PrimitiveSpanProps {}

const SelectItemIndicator = React.forwardRef<SelectItemIndicatorElement, SelectItemIndicatorProps>(
  (props: ScopedProps<SelectItemIndicatorProps>, forwardedRef) => {
    const { __scopeSelect, ...itemIndicatorProps } = props;
    const itemContext = useSelectItemContext(ITEM_INDICATOR_NAME, __scopeSelect);
    return itemContext.isSelected ? (
      <Primitive.span aria-hidden {...itemIndicatorProps} ref={forwardedRef} />
    ) : null;
  }
);

SelectItemIndicator.displayName = ITEM_INDICATOR_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectScrollUpButton
 * -----------------------------------------------------------------------------------------------*/

const SCROLL_UP_BUTTON_NAME = 'SelectScrollUpButton';

type SelectScrollUpButtonElement = SelectScrollButtonImplElement;
interface SelectScrollUpButtonProps extends Omit<SelectScrollButtonImplProps, 'onAutoScroll'> {}

const SelectScrollUpButton = React.forwardRef<
  SelectScrollUpButtonElement,
  SelectScrollUpButtonProps
>((props: ScopedProps<SelectScrollUpButtonProps>, forwardedRef) => {
  const contentContext = useSelectContentContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
  const [canScrollUp, setCanScrollUp] = React.useState(false);
  const composedRefs = useComposedRefs(forwardedRef, contentContext.onScrollButtonChange);

  React.useEffect(() => {
    if (contentContext.viewport && contentContext.isPositioned) {
      const viewport = contentContext.viewport;
      function handleScroll() {
        const canScrollUp = viewport.scrollTop > 0;
        setCanScrollUp(canScrollUp);
      }
      handleScroll();
      viewport.addEventListener('scroll', handleScroll);
      return () => viewport.removeEventListener('scroll', handleScroll);
    }
  }, [contentContext.viewport, contentContext.isPositioned]);

  return canScrollUp ? (
    <SelectScrollButtonImpl
      {...props}
      ref={composedRefs}
      onAutoScroll={() => {
        const { viewport, selectedItem } = contentContext;
        if (viewport && selectedItem) {
          viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
        }
      }}
    />
  ) : null;
});

SelectScrollUpButton.displayName = SCROLL_UP_BUTTON_NAME;

/* -------------------------------------------------------------------------------------------------
 * SelectScrollDownButton
 * -----------------------------------------------------------------------------------------------*/

const SCROLL_DOWN_BUTTON_NAME = 'SelectScrollDownButton';

type SelectScrollDownButtonElement = SelectScrollButtonImplElement;
interface SelectScrollDownButtonProps extends Omit<SelectScrollButtonImplProps, 'onAutoScroll'> {}

const SelectScrollDownButton = React.forwardRef<
  SelectScrollDownButtonElement,
  SelectScrollDownButtonProps
>((props: ScopedProps<SelectScrollDownButtonProps>, forwardedRef) => {
  const contentContext = useSelectContentContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
  const [canScrollDown, setCanScrollDown] = React.useState(false);
  const composedRefs = useComposedRefs(forwardedRef, contentContext.onScrollButtonChange);

  React.useEffect(() => {
    if (contentContext.viewport && contentContext.isPositioned) {
      const viewport = contentContext.viewport;
      function handleScroll() {
        const maxScroll = viewport.scrollHeight - viewport.clientHeight;
        // we use Math.ceil here because if the UI is zoomed-in
        // `scrollTop` is not always reported as an integer
        const canScrollDown = Math.ceil(viewport.scrollTop) < maxScroll;
        setCanScrollDown(canScrollDown);
      }
      handleScroll();
      viewport.addEventListener('scroll', handleScroll);
      return () => viewport.removeEventListener('scroll', handleScroll);
    }
  }, [contentContext.viewport, contentContext.isPositioned]);

  return canScrollDown ? (
    <SelectScrollButtonImpl
      {...props}
      ref={composedRefs}
      onAutoScroll={() => {
        const { viewport, selectedItem } = contentContext;
        if (viewport && selectedItem) {
          viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
        }
      }}
    />
  ) : null;
});

SelectScrollDownButton.displayName = SCROLL_DOWN_BUTTON_NAME;

type SelectScrollButtonImplElement = React.ElementRef<typeof Primitive.div>;
interface SelectScrollButtonImplProps extends PrimitiveDivProps {
  onAutoScroll(): void;
}

const SelectScrollButtonImpl = React.forwardRef<
  SelectScrollButtonImplElement,
  SelectScrollButtonImplProps
>((props: ScopedProps<SelectScrollButtonImplProps>, forwardedRef) => {
  const { __scopeSelect, onAutoScroll, ...scrollIndicatorProps } = props;
  const contentContext = useSelectContentContext('SelectScrollButton', __scopeSelect);
  const autoScrollTimerRef = React.useRef<number | null>(null);
  const getItems = useCollection(__scopeSelect);

  const clearAutoScrollTimer = React.useCallback(() => {
    if (autoScrollTimerRef.current !== null) {
      window.clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => clearAutoScrollTimer();
  }, [clearAutoScrollTimer]);

  // When the viewport becomes scrollable on either side, the relevant scroll button will mount.
  // Because it is part of the normal flow, it will push down (top button) or shrink (bottom button)
  // the viewport, potentially causing the active item to now be partially out of view.
  // We re-run the `scrollIntoView` logic to make sure it stays within the viewport.
  useLayoutEffect(() => {
    const activeItem = getItems().find((item) => item.ref.current === document.activeElement);
    activeItem?.ref.current?.scrollIntoView({ block: 'nearest' });
  }, [getItems]);

  return (
    <Primitive.div
      aria-hidden
      {...scrollIndicatorProps}
      ref={forwardedRef}
      style={{ flexShrink: 0, ...scrollIndicatorProps.style }}
      onPointerMove={composeEventHandlers(scrollIndicatorProps.onPointerMove, () => {
        contentContext.onItemLeave();
        if (autoScrollTimerRef.current === null) {
          autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
        }
      })}
      onPointerLeave={composeEventHandlers(scrollIndicatorProps.onPointerLeave, () => {
        clearAutoScrollTimer();
      })}
    />
  );
});

/* -------------------------------------------------------------------------------------------------
 * SelectSeparator
 * -----------------------------------------------------------------------------------------------*/

const SEPARATOR_NAME = 'SelectSeparator';

type SelectSeparatorElement = React.ElementRef<typeof Primitive.div>;
interface SelectSeparatorProps extends PrimitiveDivProps {}

const SelectSeparator = React.forwardRef<SelectSeparatorElement, SelectSeparatorProps>(
  (props: ScopedProps<SelectSeparatorProps>, forwardedRef) => {
    const { __scopeSelect, ...separatorProps } = props;
    return <Primitive.div aria-hidden {...separatorProps} ref={forwardedRef} />;
  }
);

SelectSeparator.displayName = SEPARATOR_NAME;

/* -----------------------------------------------------------------------------------------------*/

const BubbleSelect = React.forwardRef<HTMLSelectElement, React.ComponentPropsWithoutRef<'select'>>(
  (props, forwardedRef) => {
    const { value, ...selectProps } = props;
    const ref = React.useRef<HTMLSelectElement>(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const prevValue = usePrevious(value);

    // Bubble value change to parents (e.g form change event)
    React.useEffect(() => {
      const select = ref.current!;
      const selectProto = window.HTMLSelectElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(
        selectProto,
        'value'
      ) as PropertyDescriptor;
      const setValue = descriptor.set;
      if (prevValue !== value && setValue) {
        const event = new Event('change', { bubbles: true });
        setValue.call(select, value);
        select.dispatchEvent(event);
      }
    }, [prevValue, value]);

    /**
     * We purposefully use a `select` here to support form autofill as much
     * as possible.
     *
     * We purposefully do not add the `value` attribute here to allow the value
     * to be set programatically and bubble to any parent form `onChange` event.
     * Adding the `value` will cause React to consider the programatic
     * dispatch a duplicate and it will get swallowed.
     *
     * We use `VisuallyHidden` rather than `display: "none"` because Safari autofill
     * won't work otherwise.
     */
    return (
      <VisuallyHidden asChild>
        <select {...selectProps} ref={composedRefs} defaultValue={value} />
      </VisuallyHidden>
    );
  }
);

function useTypeaheadSearch(onSearchChange: (search: string) => void) {
  const handleSearchChange = useCallbackRef(onSearchChange);
  const searchRef = React.useRef('');
  const timerRef = React.useRef(0);

  const handleTypeaheadSearch = React.useCallback(
    (key: string) => {
      const search = searchRef.current + key;
      handleSearchChange(search);

      (function updateSearch(value: string) {
        searchRef.current = value;
        window.clearTimeout(timerRef.current);
        // Reset `searchRef` 1 second after it was last updated
        if (value !== '') timerRef.current = window.setTimeout(() => updateSearch(''), 1000);
      })(search);
    },
    [handleSearchChange]
  );

  const resetTypeahead = React.useCallback(() => {
    searchRef.current = '';
    window.clearTimeout(timerRef.current);
  }, []);

  React.useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);

  return [searchRef, handleTypeaheadSearch, resetTypeahead] as const;
}

/**
 * This is the "meat" of the typeahead matching logic. It takes in a list of items,
 * the search and the current item, and returns the next item (or `undefined`).
 *
 * We normalize the search because if a user has repeatedly pressed a character,
 * we want the exact same behavior as if we only had that one character
 * (ie. cycle through items starting with that character)
 *
 * We also reorder the items by wrapping the array around the current item.
 * This is so we always look forward from the current item, and picking the first
 * item will always be the correct one.
 *
 * Finally, if the normalized search is exactly one character, we exclude the
 * current item from the values because otherwise it would be the first to match always
 * and focus would never move. This is as opposed to the regular case, where we
 * don't want focus to move if the current item still matches.
 */
function findNextItem<T extends { textValue: string }>(
  items: T[],
  search: string,
  currentItem?: T
) {
  const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
  const normalizedSearch = isRepeated ? search[0] : search;
  const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
  let wrappedItems = wrapArray(items, Math.max(currentItemIndex, 0));
  const excludeCurrentItem = normalizedSearch.length === 1;
  if (excludeCurrentItem) wrappedItems = wrappedItems.filter((v) => v !== currentItem);
  const nextItem = wrappedItems.find((item) =>
    item.textValue.toLowerCase().startsWith(normalizedSearch.toLowerCase())
  );
  return nextItem !== currentItem ? nextItem : undefined;
}

/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */
function wrapArray<T>(array: T[], startIndex: number) {
  return array.map((_, index) => array[(startIndex + index) % array.length]);
}

const Root = Select;
const Trigger = SelectTrigger;
const Value = SelectValue;
const Icon = SelectIcon;
const Content = SelectContent;
const Viewport = SelectViewport;
const Group = SelectGroup;
const Label = SelectLabel;
const Item = SelectItem;
const ItemText = SelectItemText;
const ItemIndicator = SelectItemIndicator;
const ScrollUpButton = SelectScrollUpButton;
const ScrollDownButton = SelectScrollDownButton;
const Separator = SelectSeparator;

export {
  createSelectScope,
  //
  Select,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectContent,
  SelectViewport,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectSeparator,
  //
  Root,
  Trigger,
  Value,
  Icon,
  Content,
  Viewport,
  Group,
  Label,
  Item,
  ItemText,
  ItemIndicator,
  ScrollUpButton,
  ScrollDownButton,
  Separator,
};
export type {
  SelectProps,
  SelectTriggerProps,
  SelectValueProps,
  SelectIconProps,
  SelectContentProps,
  SelectViewportProps,
  SelectGroupProps,
  SelectLabelProps,
  SelectItemProps,
  SelectItemTextProps,
  SelectItemIndicatorProps,
  SelectScrollUpButtonProps,
  SelectScrollDownButtonProps,
  SelectSeparatorProps,
};
