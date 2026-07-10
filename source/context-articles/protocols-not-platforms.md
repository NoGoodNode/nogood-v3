---
permalink: false
order: 4
title: "Protocols, not platforms: a technological approach to free speech"
author: "Mike Masnick"
author_url: "https://www.techdirt.com"
original_url: "#"
---

<div class="fade-in bg-offwhite">
{% image "source/assets/img/context-illustrations/NoGood_Context_MikeMasnick_01.jpg", "Notes on Surveillance Capitalism" %}
</div>

In the last two decades, the rise of internet platforms—Facebook, Twitter, YouTube, Reddit, and others—have more or less displaced the protocol-based systems used previously. With the platforms, there is a single (usually for-profit) company that runs the services for end users. These services tend to be funded first by venture capital and then by advertising (often highly targeted).

The platforms are all built on the World Wide Web and tend to be accessed through a traditional internet web browser or, increasingly, a mobile device app. The benefits of building a service as a platform are fairly obvious: the owner has ultimate control over that platform and thus is much better positioned to monetize the platforms via advertising of some form (or other ancillary services). This does, however, incentivize these platforms to acquire an ever increasing amount of data from their users to better target them.

This has resulted in reasonable concerns and pushback from both users and regulators, who are concerned that platforms are not playing fairly or not properly “protecting” the end-user data they have been collecting.

A second problem facing the largest platforms today is that as they have become larger and more central to everyday lives, there is growing concern directed at the operators of these platforms about the content that they have enabled to be posted—as well as the responsibilities those operators might have in policing or blocking that content. They have faced increasing pressure from both users and politicians to police that content more proactively.

In some cases, laws have been passed that more explicitly require platforms to delete certain content, slowly chipping away at the earlier immunity (e.g., the Communications Decency Act, Section 230, in the US, or the E-Commerce Directive in the EU) that many platforms enjoyed over their moderation choices.

Because of this, platforms have felt reasonably compelled not only to be more proactive but also to testify before various legislative bodies, to hire thousands of employees as potential content moderators, and to invest heavily in moderation technology. Yet even with these regulatory mandates and human and technical investments, it is still not clear that any platform can actually do a “good” job of moderating content at scale.

<div class="fade-in bg-offwhite">
{% image "source/assets/img/context-illustrations/NoGood_Context_MikeMasnick_02.jpg", "Notes on Surveillance Capitalism" %}
</div>

Part of the problem is that any platform moderation decision is going to upset someone. Obviously, those whose content was moderated tend not to be happy about it, but the same is true of others who wished to see or share that content. At the same time, in many cases a decision not to moderate content can also upset people. Currently, the platforms are receiving quite a lot of criticism for their moderation choices, including accusations (mostly evidence-free, to be sure) that political bias is driving those content moderation choices. As the platforms face pressure to take on more responsibility, every choice concerning content moderation they make puts them in a bind. Remove disputed content—and anger those who created it or support it; refrain from removing disputed content—and anger those who find it problematic.

This puts the platforms in a no-win position. They can keep throwing more and more money at the problem and continue to talk to the public and politicians, but it is unclear how this ever ends with enough people being “satisfied.” It is not difficult on any given day to find people upset with platforms like Facebook, Twitter, and YouTube when they fail to take down certain content—who can immediately be replaced by those upset with the platforms when they eventually do take down that content.

This setup is frustrating for everyone involved, and it’s unlikely to get better anytime soon.

<h3>Protocols to the Rescue</h3>

In this article, I am proposing that we return to a world of protocols dominating the internet, rather than platforms. There is reason to believe that moving to a system of protocols could solve many of the problems associated with platforms today and that it could be done while minimizing the problems that were inherent to protocols a few decades ago.

While there is no silver bullet, a system of protocols could serve to do a better job of protecting both user privacy and free speech, while at the same time minimizing the impact of abusive behavior online and creating new and compelling business models that are more aligned with user interests.

The key to making this work is that while there would be specific protocols for the various types of platforms we see today, there would then be many competing interface implementations of that protocol. The competition would come from those implementations. The lowered switching costs of moving from one implementation to another would create less lock-in, and the ability for anyone to create their own interface and get access to all of the content and users on the underlying protocol makes the barriers to entry for competition drastically lower. You don’t need to build an entirely new Facebook if you already have access to everyone making use of the “social network protocol” and just provide a different, or better, interface to it.

An example of this is already seen, to some extent, in the email space. Built on open standards such as SMTP, POP3 and IMAP, there are many different implementations of email. Popular email systems in the 1980s and 1990s relied on a client-server setup whereby the service provider (whether a commercial internet service provider, a university, or an employer) would host the email only briefly on a server, until they were downloaded to the user’s own computer via some client software, like Microsoft Outlook, Eudora, or Thunderbird. Or, users could access that email via a text interface, such as Pine or Elm.

The late 1990s saw the rise of web-based email, first with Rocketmail (eventually purchased by Yahoo, becoming Yahoo Mail) and Hotmail (purchased by Microsoft, years later becoming Outlook.com). Google introduced its own offering, Gmail, in 2004, which kicked off a new round of innovation, as Gmail offered vastly more storage space for email as well as a significantly faster user interface.

However, because of these open standards, there is a great deal of flexibility. A user can use a non-Gmail email address within the Gmail interface. Or he or she can use a Gmail account with an entirely different client, such as Microsoft Outlook or Apple Mail. On top of that, it’s possible to create new interfaces on top of Gmail itself, such as with a Chrome extension.

This setup has many advantages for the end user. Even if one platform—like Gmail—becomes much more popular in the marketplace, the costs of switching are much lower. If a user does not like how Gmail handles certain features or is concerned about Google’s privacy practices, switching to a different platform is much easier, and the user does not lose access to all of his or her old contacts or the ability to email anyone else (even those contacts that remain Gmail users).

<div class="fade-in bg-offwhite">
{% image "source/assets/img/context-illustrations/NoGood_Context_MikeMasnick_03.jpg", "Notes on Surveillance Capitalism" %}
</div>

Notice that this flexibility serves as a strong incentive on Google’s part to make sure that Gmail treats its users well; Google is less likely to take actions that might lead to a rapid exodus. This is different than a fully proprietary platform such as Facebook or Twitter, where leaving those platforms means that you no longer are in communication in the same way with the people there and can no longer easily access their content and communications. With a system like Gmail, it is easy to export contacts and even legacy emails and simply begin again with a different service, without losing the ability to remain in contact with anyone.

In addition, it opens up the competitive environment much more. Even as Gmail is an especially popular email service, others are able to build up significant email services—like Outlook.com or Yahoo Mail—or to create successful startup email services that target different markets and niches—like Zohomail or Protonmail.

It also opens up other services that can build on top of the existing email ecosystem, with less fear of a being reliant on a single platform that might shut them out. For example, both Twitter and Facebook have a tendency to switch product directions and to cut off third-party apps, but in the email space, there’s a thriving market of services and companies like Boomerang, SaneBox, and MixMax, each of which provides additional services that can work on a variety of different email platforms. 

The end result is more competition to make the service better, both between and within email services, and strong incentives to keep the major providers acting in their users’ best interests, since the significantly lower lock-in gives those users the option to leave.