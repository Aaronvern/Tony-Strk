//! # PaywallAnonymizer - DRAFT, NOT AUDITED
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
//! **This contract has not been reviewed or audited. Do not deploy it to
//! mainnet before it has been.** Anonymizer contracts are the application
//! team's code to own; this is a starting point for that review, not a
//! finished artefact.

use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

pub mod errors {
    pub const ZERO_MERCHANT: felt252 = 'PAYWALL: zero merchant';
    pub const ZERO_TOKEN: felt252 = 'PAYWALL: zero token';
    pub const ZERO_PRICE: felt252 = 'PAYWALL: zero price';
    pub const FUNDING_BELOW_PRICE: felt252 = 'PAYWALL: funding below price';
    pub const MERCHANT_SHORTFALL: felt252 = 'PAYWALL: merchant shortfall';
    pub const SPENT_MISMATCH: felt252 = 'PAYWALL: spent mismatch';
}

#[starknet::interface]
pub trait IPaywallAnonymizer<T> {
    /// The entry point the privacy pool calls via `INVOKE_SELECTOR`.
    ///
    /// * `merchant` - who gets paid.
    /// * `token` - the ERC20 being paid in.
    /// * `funding` - how much the pool withdrew to this helper for this call.
    /// * `price` - what the resource costs; the merchant receives exactly this.
    /// * `resource_hash` - opaque identifier of what was bought. Emitted in the
    ///   receipt so the merchant can match a payment to an entitlement without
    ///   learning anything about the payer.
    /// * `change_note_id` - the open note to credit with `funding - price`.
    fn privacy_invoke(
        ref self: T,
        merchant: ContractAddress,
        token: ContractAddress,
        funding: u128,
        price: u128,
        resource_hash: felt252,
        change_note_id: felt252,
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
            funding: u128,
            price: u128,
            resource_hash: felt252,
            change_note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            assert(merchant.is_non_zero(), errors::ZERO_MERCHANT);
            assert(token.is_non_zero(), errors::ZERO_TOKEN);
            assert(price.is_non_zero(), errors::ZERO_PRICE);
            assert(funding >= price, errors::FUNDING_BELOW_PRICE);

            let self_addr = get_contract_address();
            // Stateless and permissionless: whoever called is approved to pull
            // the change. Nothing is held across transactions, so there is
            // nothing for an uninvited caller to take.
            let pool = get_caller_address();
            let erc20 = IERC20Dispatcher { contract_address: token };

            // Measure both sides rather than trusting `transfer`'s bool. A
            // fee-on-transfer token would otherwise leave the merchant short
            // while the buyer believed the resource was paid for.
            let merchant_before = erc20.balance_of(account: merchant);
            let self_before = erc20.balance_of(account: self_addr);

            erc20.transfer(recipient: merchant, amount: price.into());

            let merchant_received = erc20.balance_of(account: merchant) - merchant_before;
            assert(merchant_received == price.into(), errors::MERCHANT_SHORTFALL);

            let spent = self_before - erc20.balance_of(account: self_addr);
            assert(spent == price.into(), errors::SPENT_MISMATCH);

            self.emit(PaywallPaid { merchant, resource_hash, token, price });

            let change = funding - price;
            if change.is_zero() {
                // Valid: it means "credit nothing". The exact-payment case.
                return array![].span();
            }

            // The pool performs the pull itself when applying deposits, so the
            // helper approves rather than transfers.
            erc20.approve(spender: pool, amount: change.into());

            [OpenNoteDeposit { note_id: change_note_id, token, amount: change }].span()
        }
    }
}
