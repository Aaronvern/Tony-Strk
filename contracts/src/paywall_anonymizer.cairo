//! # PaywallAnonymizer
//!
//! An anonymizer (helper) contract that pays a merchant out of the STRK20
//! privacy pool and returns the change to an open note.
//!
//! The point is a paywall an agent can satisfy without identifying itself.
//! Observers see the pool pay the merchant; they do not see who asked for it.
//! The merchant gets a public, verifiable receipt bound to the resource that
//! was bought, so it can grant access without ever learning the buyer.
//!
//!   withdraw from pool  ->  pay the merchant  ->  change to an open note
//!
//! All of it in one transaction. A revert anywhere aborts the pool transaction
//! and no funds move.
//!
//! ## Two modes, and why the caller must choose one
//!
//! The pool counts open notes. `EmitOpenNoteCreated` increments a counter,
//! each applied deposit decrements it, and `_apply_actions` asserts the
//! counter is zero at the end. So a helper that returns an empty span while
//! the action list created an open note aborts the whole transaction with
//! `UNDEPOSITED_OPEN_NOTES`; and a helper that keeps a remainder while
//! returning no deposit strands those tokens in a contract anyone can call.
//!
//! `change_note_id` therefore states the caller's intent and is checked
//! against the measured remainder:
//!
//! * `Some(note_id)` - the action list created an open note. There must be a
//!   non-zero remainder to credit to it.
//! * `None`          - the action list created no open note. The payment must
//!   consume the funding exactly.
//!
//! A mismatch reverts here, with a legible error, rather than downstream in
//! the pool or silently as stranded funds.
//!
//! ## Nothing declared is trusted
//!
//! The amount the pool withdrew is read from the token, not taken as a
//! parameter. A declared funding amount is a liability in a permissionless
//! contract: declare it high and the helper approves the pool for tokens it
//! does not hold; declare it low and the remainder is left behind for the
//! next caller to sweep. Balances are the only honest source.
//!
//! Both sides of the transfer are measured for the same reason. That check is
//! also what makes a re-entrant token safe: a callback that moves more of the
//! helper's balance changes the delta, and the delta is asserted to be exactly
//! `price`.
//!
//! ## Before deploying
//!
//! The pool's default `OpenNoteScreeningPolicy` is `Required`. A helper that
//! returns deposits under that policy makes *its own address* the
//! transaction's screening subject, and only the pool's app governor can
//! change a helper's policy. Confirm the policy that will apply to this
//! contract's address before relying on the `Some(note_id)` path on mainnet.
//! The `None` path returns no deposits and so is not subject to it.
//!
//! **This contract has not been externally audited.** Anonymizer contracts are
//! the application team's code to own; route it through review and an audit
//! before it holds anyone else's money.

use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

pub mod errors {
    pub const ZERO_MERCHANT: felt252 = 'PAYWALL: zero merchant';
    pub const ZERO_TOKEN: felt252 = 'PAYWALL: zero token';
    pub const ZERO_PRICE: felt252 = 'PAYWALL: zero price';
    pub const ZERO_RESOURCE: felt252 = 'PAYWALL: zero resource hash';
    pub const MERCHANT_IS_HELPER: felt252 = 'PAYWALL: merchant is helper';
    pub const MERCHANT_IS_POOL: felt252 = 'PAYWALL: merchant is pool';
    pub const FUNDING_BELOW_PRICE: felt252 = 'PAYWALL: funding below price';
    pub const MERCHANT_SHORTFALL: felt252 = 'PAYWALL: merchant shortfall';
    pub const MERCHANT_OVERPAID: felt252 = 'PAYWALL: merchant overpaid';
    pub const SPENT_MISMATCH: felt252 = 'PAYWALL: spent mismatch';
    pub const CHANGE_OVERFLOW: felt252 = 'PAYWALL: change overflow';
    pub const CHANGE_WITHOUT_NOTE: felt252 = 'PAYWALL: change without note';
    pub const NOTE_WITHOUT_CHANGE: felt252 = 'PAYWALL: note without change';
}

#[starknet::interface]
pub trait IPaywallAnonymizer<T> {
    /// The entry point the privacy pool calls via `INVOKE_SELECTOR`.
    ///
    /// #### Parameters
    /// * `merchant` - who gets paid. Must not be the helper or the pool.
    /// * `token` - the ERC20 being paid in.
    /// * `price` - what the resource costs; the merchant receives exactly this.
    /// * `resource_hash` - opaque identifier of what was bought. Emitted in the
    ///   receipt so the merchant can match a payment to an entitlement without
    ///   learning anything about the payer.
    /// * `change_note_id` - `Some(id)` when the action list created an open
    ///   note for the change, `None` when the payment is exact.
    ///
    /// #### Returns
    /// One `OpenNoteDeposit` for the change, or an empty span when the payment
    /// was exact.
    ///
    /// #### Calldata
    /// `Option` carries a variant index, so `Some(id)` serializes as `[0, id]`
    /// and `None` as `[1]`. A dapp sending the open-note placeholder writes
    /// `["0", "${openNoteIds[0]}"]` for the last argument.
    ///
    /// #### Reverts
    /// * If the funding the pool withdrew is below `price`.
    /// * If the merchant does not receive exactly `price`, or the helper does
    ///   not part with exactly `price`.
    /// * If `change_note_id` disagrees with the measured remainder.
    fn privacy_invoke(
        ref self: T,
        merchant: ContractAddress,
        token: ContractAddress,
        price: u128,
        resource_hash: felt252,
        change_note_id: Option<felt252>,
    ) -> Span<OpenNoteDeposit>;
}

#[starknet::contract]
pub mod PaywallAnonymizer {
    use core::num::traits::Zero;
    use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use privacy::objects::OpenNoteDeposit;
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    use super::{IPaywallAnonymizer, errors};

    #[storage]
    struct Storage {}

    #[constructor]
    fn constructor(ref self: ContractState) {}

    /// The receipt. Public by design: a merchant needs to verify the payment,
    /// and nothing here identifies the payer.
    #[derive(Drop, starknet::Event)]
    pub struct PaywallPaid {
        #[key]
        pub merchant: ContractAddress,
        #[key]
        pub resource_hash: felt252,
        pub token: ContractAddress,
        pub price: u128,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        PaywallPaid: PaywallPaid,
    }

    #[abi(embed_v0)]
    pub impl PaywallAnonymizerImpl of IPaywallAnonymizer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            merchant: ContractAddress,
            token: ContractAddress,
            price: u128,
            resource_hash: felt252,
            change_note_id: Option<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(merchant.is_non_zero(), errors::ZERO_MERCHANT);
            assert(token.is_non_zero(), errors::ZERO_TOKEN);
            assert(price.is_non_zero(), errors::ZERO_PRICE);
            // A receipt nobody can match to an entitlement is not a receipt.
            assert(resource_hash.is_non_zero(), errors::ZERO_RESOURCE);

            let self_addr = get_contract_address();
            // Stateless and permissionless: whoever called is approved to pull
            // the change. Nothing is held across transactions, so there is
            // nothing for an uninvited caller to take.
            let pool = get_caller_address();
            // Paying either of these makes the balance deltas below
            // meaningless, and paying the pool burns the funds into its
            // balance with no note to show for it.
            assert(merchant != self_addr, errors::MERCHANT_IS_HELPER);
            assert(merchant != pool, errors::MERCHANT_IS_POOL);

            let erc20 = IERC20Dispatcher { contract_address: token };
            let price_u256: u256 = price.into();

            // What the pool actually withdrew for this call. Read, not
            // declared: see the module docs on why a declared amount is unsafe
            // in a contract anyone can call.
            let held_before = erc20.balance_of(account: self_addr);
            assert(held_before >= price_u256, errors::FUNDING_BELOW_PRICE);

            let merchant_before = erc20.balance_of(account: merchant);

            erc20.transfer(recipient: merchant, amount: price_u256);

            // Measure both sides rather than trusting `transfer`'s bool. A
            // fee-on-transfer token would otherwise leave the merchant short
            // while the buyer believed the resource was paid for, and a
            // re-entrant one could move more than `price` on the way through.
            let merchant_after = erc20.balance_of(account: merchant);
            assert(merchant_after >= merchant_before, errors::MERCHANT_SHORTFALL);
            let merchant_received = merchant_after - merchant_before;
            assert(merchant_received >= price_u256, errors::MERCHANT_SHORTFALL);
            assert(merchant_received <= price_u256, errors::MERCHANT_OVERPAID);

            let held_after = erc20.balance_of(account: self_addr);
            // Subtract only in the direction that cannot underflow, so a token
            // that credits the helper mid-call reverts with our error rather
            // than an opaque arithmetic panic.
            assert(held_after <= held_before, errors::SPENT_MISMATCH);
            assert(held_before - held_after == price_u256, errors::SPENT_MISMATCH);

            self.emit(PaywallPaid { merchant, resource_hash, token, price });

            // The change is whatever is actually left, so nothing can be
            // stranded here and nothing can be over-approved.
            let change: u128 = held_after.try_into().expect(errors::CHANGE_OVERFLOW);

            match change_note_id {
                Some(note_id) => {
                    // An open note was created for this. The pool asserts a
                    // non-zero deposit amount, and an open note left
                    // undeposited aborts the transaction, so refuse early and
                    // say why.
                    assert(change.is_non_zero(), errors::NOTE_WITHOUT_CHANGE);
                    // The pool performs the pull itself when applying
                    // deposits, so the helper approves rather than transfers.
                    erc20.approve(spender: pool, amount: held_after);
                    [OpenNoteDeposit { note_id, token, amount: change }].span()
                },
                None => {
                    // Exact payment. An empty span is valid and means "credit
                    // nothing" - but only if there is genuinely nothing left,
                    // otherwise the remainder is abandoned here.
                    assert(change.is_zero(), errors::CHANGE_WITHOUT_NOTE);
                    array![].span()
                },
            }
        }
    }
}
